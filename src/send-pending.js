require('dotenv').config();

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require('@whiskeysockets/baileys');

const P = require('pino');
const { createClient } = require('@supabase/supabase-js');

const {
  downloadSession,
  uploadSession,
  AUTH_DIR,
} = require('./lib/session-store');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fetchPendingMessages() {
  const { data, error } = await supabase
    .from('whatsapp_queue')
    .select('*')
    .eq('status', 'pendente')
    .order('created_at', { ascending: true })
    .limit(20);

  if (error) throw error;

  return data;
}

async function markMessage(id, status, errorMsg = null) {
  const { error } = await supabase
    .from('whatsapp_queue')
    .update({
      status,
      enviado_em: new Date().toISOString(),
      erro: errorMsg,
    })
    .eq('id', id);

  if (error) {
    console.error(
      'Erro ao atualizar Supabase:',
      error.message
    );
  }
}

async function main() {
  const hasSession = await downloadSession();

  if (!hasSession) {
    console.error(
      'Nenhuma sessao salva. Rode npm run setup primeiro.'
    );
    process.exit(1);
  }

  const pending = await fetchPendingMessages();

  if (pending.length === 0) {
    console.log(
      'Nenhuma mensagem pendente. Nada a fazer.'
    );
    return;
  }

  const { state, saveCreds } =
    await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' }),
  });

  sock.ev.on('creds.update', saveCreds);

  await new Promise((resolve, reject) => {
    sock.ev.on(
      'connection.update',
      async (update) => {
        const {
          connection,
          lastDisconnect,
        } = update;

        if (connection === 'open') {
          console.log(
            '========================================'
          );
          console.log('WHATSAPP CONECTADO');
          console.log(
            '========================================'
          );

          console.log(
            'Conta conectada:',
            sock.user?.id || 'nao identificada'
          );

          console.log(
            `Mensagens pendentes: ${pending.length}`
          );

          for (const msg of pending) {
            try {
              const numero = String(
                msg.telefone
              ).replace(/\D/g, '');

              console.log(
                '----------------------------------------'
              );

              console.log(
                `Numero: ${numero}`
              );

              console.log(
                `Mensagem: ${msg.mensagem}`
              );

              console.log(
                'Consultando numero no WhatsApp...'
              );

              const resultado =
                await sock.onWhatsApp(numero);

              console.log(
                'Resultado onWhatsApp:',
                JSON.stringify(
                  resultado,
                  null,
                  2
                )
              );

              if (
                !resultado ||
                resultado.length === 0
              ) {
                throw new Error(
                  `WhatsApp nao retornou resultado para ${numero}`
                );
              }

              if (!resultado[0].exists) {
                throw new Error(
                  `O numero ${numero} nao foi encontrado no WhatsApp`
                );
              }

              const jid = resultado[0].jid;

              console.log(
                `JID confirmado: ${jid}`
              );

              console.log(
                'Enviando mensagem...'
              );

              const resposta =
                await sock.sendMessage(
                  jid,
                  {
                    text: msg.mensagem,
                  }
                );

              console.log(
                'RETORNO DO sendMessage:'
              );

              console.log(
                JSON.stringify(
                  resposta,
                  null,
                  2
                )
              );

              console.log(
                `ID: ${resposta?.key?.id}`
              );

              console.log(
                `Remote JID: ${resposta?.key?.remoteJid}`
              );

              console.log(
                `From Me: ${resposta?.key?.fromMe}`
              );

              await new Promise(
                (resolve) =>
                  setTimeout(resolve, 5000)
              );

              await markMessage(
                msg.id,
                'enviado'
              );

              console.log(
                `PROCESSADO -> ${numero}`
              );

            } catch (err) {
              console.error(
                `FALHA -> ${msg.telefone}:`,
                err.message
              );

              await markMessage(
                msg.id,
                'falha',
                err.message
              );
            }
          }

          console.log(
            'Mensagens processadas.'
          );

          try {
            await uploadSession();

            console.log(
              'Sessao salva com sucesso.'
            );
          } catch (err) {
            console.error(
              'Erro ao salvar sessao:',
              err.message
            );
          }

          resolve();
        }

        if (connection === 'close') {
          const statusCode =
            lastDisconnect?.error?.output
              ?.statusCode;

          console.log(
            'Conexao fechada.',
            statusCode
          );

          if (
            statusCode ===
            DisconnectReason.loggedOut
          ) {
            reject(
              new Error(
                'Sessao invalidada. Rode npm run setup novamente.'
              )
            );
          }
        }
      }
    );
  });

  process.exit(0);
}

main().catch((err) => {
  console.error(
    'Erro fatal:',
    err
  );

  process.exit(1);
});
```

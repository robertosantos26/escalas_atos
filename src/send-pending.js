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

async function fetchFreshQueueMessage(id) {
  const { data, error } = await supabase
    .from('whatsapp_queue')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

function normalizarStatus(status) {
  return String(status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function statusConfirmado(status) {
  return [
    'sim',
    'confirmado',
    'confirmada',
    'confirma',
    'presente',
    'vou',
    'confirmou',
  ].includes(normalizarStatus(status));
}

async function cancelarMensagem(id, motivo) {
  const { error } = await supabase
    .from('whatsapp_queue')
    .update({
      status: 'cancelado',
      enviado_em: new Date().toISOString(),
      erro: motivo,
    })
    .eq('id', id)
    .eq('status', 'pendente');

  if (error) throw error;
  console.log(`CANCELADO -> ${id}: ${motivo}`);
}

async function revalidarAntesDoEnvio(msg) {
  const usuarioId = msg.usuario_id || msg.user_id || msg.membro_id || msg.member_id;
  const cultoId = msg.culto_id || msg.evento_id || msg.event_id;

  // Sem os IDs não é seguro tentar adivinhar a disponibilidade.
  // A proteção por duplicidade abaixo continua ativa.
  if (!usuarioId || !cultoId) return false;

  // A estrutura pode usar usuario_id ou membro_id. Tentamos as duas formas.
  const consultas = [
    ['usuario_id', usuarioId],
    ['membro_id', usuarioId],
  ];

  for (const [campoUsuario, valorUsuario] of consultas) {
    const { data, error } = await supabase
      .from('disponibilidade')
      .select('id,status,updated_at,created_at')
      .eq(campoUsuario, valorUsuario)
      .eq('culto_id', cultoId)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      // Se a coluna não existir, tenta a próxima nomenclatura.
      if (/column|does not exist|schema cache/i.test(error.message || '')) {
        continue;
      }
      throw error;
    }

    if (!data) continue;

    if (statusConfirmado(data.status)) {
      await cancelarMensagem(
        msg.id,
        `Cancelado: usuario ja confirmou (${data.status})`
      );
      return true;
    }

    return false;
  }

  return false;
}

async function existeDuplicataRecente(msg) {
  const telefone = String(msg.telefone || '').replace(/\D/g, '');
  const mensagem = String(msg.mensagem || '').trim();

  if (!telefone || !mensagem) return false;

  // Impede que uma nova execução da automação envie novamente a mesma mensagem
  // caso o gerador da fila tenha criado outra linha para a mesma pessoa.
  const limite = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('whatsapp_queue')
    .select('id,created_at,enviado_em')
    .eq('status', 'enviado')
    .eq('telefone', msg.telefone)
    .eq('mensagem', msg.mensagem)
    .gte('enviado_em', limite)
    .neq('id', msg.id)
    .limit(1);

  if (error) {
    // Algumas bases podem não ter enviado_em preenchido em registros antigos.
    // Nesse caso não bloqueamos o envio por causa da proteção secundária.
    console.warn('Nao foi possivel verificar duplicidade:', error.message);
    return false;
  }

  return Array.isArray(data) && data.length > 0;
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
    console.error('Erro ao atualizar Supabase:', error.message);
  }
}

async function main() {
  const hasSession = await downloadSession();

  if (!hasSession) {
    console.error('Nenhuma sessao salva. Rode npm run setup primeiro.');
    process.exit(1);
  }

  const pending = await fetchPendingMessages();

  if (pending.length === 0) {
    console.log('Nenhuma mensagem pendente. Nada a fazer.');
    return;
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' }),
  });

  sock.ev.on('creds.update', saveCreds);

  await new Promise((resolve, reject) => {
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'open') {
        console.log('========================================');
        console.log('WHATSAPP CONECTADO');
        console.log('========================================');
        console.log('Conta conectada:', sock.user?.id || 'nao identificada');
        console.log(`Mensagens pendentes: ${pending.length}`);

        for (const msg of pending) {
          try {
            // Busca novamente a fila imediatamente antes de processar.
            const atual = await fetchFreshQueueMessage(msg.id);

            if (!atual || atual.status !== 'pendente') {
              console.log(`IGNORADO -> ${msg.id}: mensagem nao esta mais pendente.`);
              continue;
            }

            // 1) Reconsulta a disponibilidade atual no Supabase.
            if (await revalidarAntesDoEnvio(atual)) continue;

            // 2) Impede reenvio da mesma mensagem em duplicidade.
            if (await existeDuplicataRecente(atual)) {
              await cancelarMensagem(
                atual.id,
                'Cancelado: mesma mensagem ja foi enviada para este numero nas ultimas 24h'
              );
              continue;
            }

            const numero = String(atual.telefone).replace(/\D/g, '');

            console.log('----------------------------------------');
            console.log(`Numero: ${numero}`);
            console.log(`Mensagem: ${atual.mensagem}`);
            console.log('Consultando numero no WhatsApp...');

            const resultado = await sock.onWhatsApp(numero);

            console.log(
              'Resultado onWhatsApp:',
              JSON.stringify(resultado, null, 2)
            );

            if (!resultado || resultado.length === 0) {
              throw new Error(`WhatsApp nao retornou resultado para ${numero}`);
            }

            if (!resultado[0].exists) {
              throw new Error(`O numero ${numero} nao foi encontrado no WhatsApp`);
            }

            const jid = resultado[0].jid;

            console.log(`JID confirmado: ${jid}`);
            console.log('Enviando mensagem...');

            const resposta = await sock.sendMessage(jid, {
              text: atual.mensagem,
            });

            console.log('RETORNO DO sendMessage:');
            console.log(JSON.stringify(resposta, null, 2));
            console.log(`ID: ${resposta?.key?.id}`);
            console.log(`Remote JID: ${resposta?.key?.remoteJid}`);
            console.log(`From Me: ${resposta?.key?.fromMe}`);

            await new Promise((resolve) => setTimeout(resolve, 5000));

            await markMessage(atual.id, 'enviado');
            console.log(`PROCESSADO -> ${numero}`);
          } catch (err) {
            console.error(`FALHA -> ${msg.telefone}:`, err.message);
            await markMessage(msg.id, 'falha', err.message);
          }
        }

        console.log('Mensagens processadas.');

        try {
          await uploadSession();
          console.log('Sessao salva com sucesso.');
        } catch (err) {
          console.error('Erro ao salvar sessao:', err.message);
        }

        resolve();
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;

        console.log('Conexao fechada.', statusCode);

        if (statusCode === DisconnectReason.loggedOut) {
          reject(new Error('Sessao invalidada. Rode npm run setup novamente.'));
        }
      }
    });
  });

  process.exit(0);
}

main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});

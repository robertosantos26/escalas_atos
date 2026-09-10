// Executado pelo GitHub Actions (ou manualmente com `npm run send`).
// Le mensagens pendentes na tabela `whatsapp_queue` do Supabase e envia via WhatsApp.

require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const P = require('pino');
const { createClient } = require('@supabase/supabase-js');
const { downloadSession, uploadSession, AUTH_DIR } = require('./lib/session-store');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fetchPendingMessages() {
  const { data, error } = await supabase
    .from('whatsapp_queue')
    .select('*')
    .eq('status', 'pendente')
    .order('created_at', { ascending: true })
    .limit(20); // trava de seguranca: nunca manda mais que 20 por execucao

  if (error) throw error;
  return data;
}

async function markMessage(id, status, errorMsg = null) {
  await supabase
    .from('whatsapp_queue')
    .update({ status, enviado_em: new Date().toISOString(), erro: errorMsg })
    .eq('id', id);
}

async function main() {
  const hasSession = await downloadSession();
  if (!hasSession) {
    console.error('Nenhuma sessao salva ainda. Rode "npm run setup" na sua maquina local primeiro.');
    process.exit(1);
  }

  const pending = await fetchPendingMessages();
  if (pending.length === 0) {
    console.log('Nenhuma mensagem pendente. Nada a fazer.');
    return;
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const sock = makeWASocket({ auth: state, logger: P({ level: 'silent' }) });
  sock.ev.on('creds.update', saveCreds);

  await new Promise((resolve, reject) => {
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'open') {
        console.log(`Conectado. Enviando ${pending.length} mensagem(ns)...`);

        for (const msg of pending) {
          try {
            const numero = String(msg.telefone).replace(/\D/g, '');
            const jid = `${numero}@s.whatsapp.net`;
            await sock.sendMessage(jid, { text: msg.mensagem });
            await markMessage(msg.id, 'enviado');
            console.log(`OK -> ${msg.telefone}`);
            await new Promise((r) => setTimeout(r, 2000)); // intervalo entre envios
          } catch (err) {
            console.error(`FALHA -> ${msg.telefone}:`, err.message);
            await markMessage(msg.id, 'falha', err.message);
          }
        }

        await uploadSession();
        resolve();
      }

      if (connection === 'close') {
        const loggedOut = lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut;
        if (loggedOut) {
          reject(new Error('Sessao invalidada (logout no celular). Rode "npm run setup" novamente.'));
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

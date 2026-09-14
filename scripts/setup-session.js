require('dotenv').config();

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require('@whiskeysockets/baileys');

const P = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

const {
  uploadSession,
  AUTH_DIR,
} = require('../src/lib/session-store');

async function main() {
  console.log('========================================');
  console.log('CONFIGURACAO DO WHATSAPP');
  console.log('========================================');

  // Limpa sessão local antiga
  if (fs.existsSync(AUTH_DIR)) {
    fs.rmSync(AUTH_DIR, {
      recursive: true,
      force: true,
    });
  }

  fs.mkdirSync(AUTH_DIR, {
    recursive: true,
  });

  const { state, saveCreds } =
    await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
  });

  sock.ev.on('creds.update', saveCreds);

  await new Promise((resolve, reject) => {
    sock.ev.on('connection.update', async (update) => {
      const {
        connection,
        lastDisconnect,
        qr,
      } = update;

      if (qr) {
        console.log('');
        console.log('========================================');
        console.log('ESCANEIE O QR CODE PELO WHATSAPP');
        console.log('========================================');
        console.log('');

        qrcode.generate(qr, {
          small: true,
        });

        console.log('');
        console.log('No celular:');
        console.log('WhatsApp > Configuracoes > Aparelhos conectados');
        console.log('> Conectar um aparelho');
        console.log('');
      }

      if (connection === 'open') {
        console.log('');
        console.log('========================================');
        console.log('WHATSAPP CONECTADO COM SUCESSO!');
        console.log('========================================');
        console.log(
          'Conta:',
          sock.user?.id || 'nao identificada'
        );

        try {
          await uploadSession();

          console.log('');
          console.log('Sessao salva no Supabase com sucesso!');
          console.log('A automacao pode voltar a funcionar.');
        } catch (err) {
          console.error(
            'Erro ao salvar sessao:',
            err.message
          );

          reject(err);
          return;
        }

        resolve();
      }

      if (connection === 'close') {
        const statusCode =
          lastDisconnect?.error?.output?.statusCode;

        console.log(
          'Conexao fechada.',
          statusCode
        );

        if (
          statusCode === DisconnectReason.loggedOut
        ) {
          reject(
            new Error(
              'WhatsApp desconectou a sessao. Gere um novo QR Code.'
            )
          );
        }
      }
    });
  });

  process.exit(0);
}

main().catch((err) => {
  console.error('');
  console.error('ERRO:', err);
  process.exit(1);
});

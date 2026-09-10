const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BUCKET = 'whatsapp-session';
const FILE_NAME = 'session.zip';
const ROOT = path.join(__dirname, '..', '..');
const LOCAL_ZIP = path.join(ROOT, 'session.zip');
const AUTH_DIR = path.join(ROOT, 'auth_info_baileys');

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY nao definidos'
    );
  }

  return createClient(url, key);
}

async function downloadSession() {
  const supabase = getSupabase();

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(FILE_NAME);

  if (error) {
    console.log(
      'Nenhuma sessao encontrada no Supabase Storage ainda:',
      error.message
    );
    return false;
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  fs.writeFileSync(LOCAL_ZIP, buffer);

  if (fs.existsSync(AUTH_DIR)) {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  }

  fs.mkdirSync(AUTH_DIR, { recursive: true });

  execSync(
    `powershell -NoProfile -Command "Expand-Archive -Path '${LOCAL_ZIP}' -DestinationPath '${AUTH_DIR}' -Force"`
  );

  return true;
}

async function uploadSession() {
  const supabase = getSupabase();

  if (fs.existsSync(LOCAL_ZIP)) {
    fs.rmSync(LOCAL_ZIP);
  }

  console.log('Compactando sessao...');

  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${AUTH_DIR}\\*' -DestinationPath '${LOCAL_ZIP}' -Force"`
  );

  console.log('Enviando sessao para o Supabase...');

  const buffer = fs.readFileSync(LOCAL_ZIP);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(FILE_NAME, buffer, {
      contentType: 'application/zip',
      upsert: true,
    });

  if (error) {
    throw error;
  }

  console.log('Sessao do WhatsApp salva no Supabase Storage.');
}

module.exports = {
  downloadSession,
  uploadSession,
  AUTH_DIR,
};
// ============================================================
// CONFIGURAÇÃO — preencha com os dados do SEU projeto Supabase
// Encontre esses valores em: Supabase Dashboard > Project Settings > API
// ============================================================
window.APP_CONFIG = {
  SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
  SUPABASE_ANON_KEY: "SUA_ANON_KEY_AQUI"
};

// Nota: a "anon key" é pública por natureza (fica exposta no navegador).
// A segurança dos seus dados vem das políticas de Row Level Security (RLS)
// definidas em supabase/schema.sql — cada usuário só enxerga suas próprias linhas.

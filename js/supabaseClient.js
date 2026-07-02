// Cria o cliente Supabase usado por toda a aplicação.
// Depende do script UMD carregado no index.html (window.supabase).
const { createClient } = window.supabase;

window.db = createClient(
  window.APP_CONFIG.SUPABASE_URL,
  window.APP_CONFIG.SUPABASE_ANON_KEY
);

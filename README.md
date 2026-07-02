# Meu Painel — organização pessoal & trabalho

Painel pessoal com **Tarefas** (matriz de prioridade), **Metas** (estilo OKR simplificado),
**Agenda** e **Clientes** (pipeline comercial: Contato feito → Reunião agendada →
Proposta enviada → Fechado/Perdido). Frontend em HTML/CSS/JS puro (sem build step),
dados no **Supabase** (com login e Row Level Security), deploy estático na **Vercel**.

```
organizador/
├── index.html
├── css/style.css
├── js/
│   ├── config.js          ← você edita com suas chaves do Supabase
│   ├── supabaseClient.js
│   └── app.js
├── supabase/schema.sql    ← rode isso no seu projeto Supabase
├── vercel.json
└── .gitignore
```

## 1. Criar o projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) → **New project**.
2. Espere o projeto provisionar (1–2 min).
3. Vá em **SQL Editor** → **New query**, cole todo o conteúdo de
   `supabase/schema.sql` e clique em **Run**. Isso cria as tabelas
   `tasks`, `goals`, `events`, `clients` já com Row Level Security
   (cada usuário só vê os próprios dados).
4. Vá em **Authentication → Providers** e confirme que **Email** está
   habilitado (vem habilitado por padrão).
   - Opcional, para testar rápido sem confirmar e-mail: em
     **Authentication → Settings**, desative "Confirm email". Para uso
     real, deixe ativado.
5. Vá em **Project Settings → API** e copie:
   - **Project URL**
   - **anon public key**

## 2. Configurar o frontend

Abra `js/config.js` e substitua:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
  SUPABASE_ANON_KEY: "SUA_ANON_KEY_AQUI"
};
```

A `anon key` é feita para ser pública (fica exposta no navegador) — a
segurança real vem das políticas de RLS já criadas pelo `schema.sql`.

## 3. Testar localmente (opcional)

Como não há build step, basta servir os arquivos estáticos:

```bash
cd organizador
python3 -m http.server 8080
# abra http://localhost:8080
```

Crie sua conta na tela de login (e-mail + senha) e comece a usar.

## 4. Subir para o GitHub

```bash
cd organizador
git init
git add .
git commit -m "Painel de despacho: tarefas, metas e agenda"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPO.git
git push -u origin main
```

> Atenção: `js/config.js` fica versionado com sua anon key — isso é
> esperado e seguro (ver nota acima). Só não versione, se algum dia
> criar, chaves `service_role` (essas sim são secretas).

## 5. Deploy na Vercel

**Opção A — pelo site:**
1. [vercel.com](https://vercel.com) → **Add New… → Project**.
2. Importe o repositório do GitHub que você acabou de criar.
3. Framework preset: **Other** (é site estático, sem build).
4. Build command: deixe vazio. Output directory: `.` (raiz).
5. **Deploy**.

**Opção B — pela CLI:**
```bash
npm i -g vercel
cd organizador
vercel --prod
```

Pronto — sua URL `https://seu-projeto.vercel.app` já estará no ar,
com login, tarefas, metas e agenda persistindo no Supabase.

## Como usar

- **Hoje**: painel do dia — tarefas do dia, atrasadas, próximos
  compromissos e metas ativas.
- **Tarefas**: organizadas na matriz de prioridade (urgente/importante).
  Filtre por Trabalho/Pessoal. Marque como concluída ou exclua.
- **Metas**: crie metas mensais ou trimestrais, arraste o slider de
  progresso — ao chegar em 100% ela marca como concluída sozinha.
- **Agenda**: compromissos futuros agrupados por data.
- **Clientes**: quadro com as etapas do seu funil comercial (Contato
  feito, Reunião agendada, Proposta enviada, Fechado, Perdido).
  Cada cliente tem empresa, telefone, e-mail, próxima ação e a data
  dela. Mude a etapa direto pelo seletor no card. Clientes com
  próxima ação vencida ou para hoje aparecem destacados na tela Hoje.
- Botão **+** (canto inferior direito): cria tarefa, meta, compromisso
  ou cliente, escolhendo o tipo pelas abas do modal.

## Próximos passos possíveis

- Visão de calendário em grade (mês) na Agenda.
- Notificações/lembretes (ex: via cron job + webhook, como você já fez
  no SeasonalSender com o Apps Script).
- Recorrência de tarefas e compromissos.
- Histórico de interações por cliente (linha do tempo de contatos).
- Exportar/backup dos dados em CSV.

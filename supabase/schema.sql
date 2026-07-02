-- ============================================================
-- Painel Pessoal — schema Supabase
-- Rode este script inteiro no SQL Editor do seu projeto Supabase
-- (Supabase Dashboard > SQL Editor > New query > cole e clique em Run)
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- TASKS ----------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  title text not null,
  description text,
  category text not null default 'pessoal' check (category in ('trabalho','pessoal')),
  quadrant text not null default 'importante_nao_urgente'
    check (quadrant in ('urgente_importante','importante_nao_urgente','urgente_nao_importante','nem_um_nem_outro')),
  status text not null default 'todo' check (status in ('todo','doing','done')),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- GOALS (metas / OKR simplificado) ----------
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  title text not null,
  description text,
  category text not null default 'pessoal' check (category in ('trabalho','pessoal')),
  period text not null default 'mensal' check (period in ('mensal','trimestral')),
  target_date date,
  progress int not null default 0 check (progress between 0 and 100),
  status text not null default 'ativa' check (status in ('ativa','concluida','pausada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- EVENTS (agenda) ----------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  title text not null,
  description text,
  category text not null default 'pessoal' check (category in ('trabalho','pessoal')),
  event_date date not null,
  event_time time,
  created_at timestamptz not null default now()
);

-- ---------- CLIENTS (carteira de clientes / pipeline comercial) ----------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  company text,
  phone text,
  email text,
  stage text not null default 'contato'
    check (stage in ('contato','reuniao_agendada','proposta_enviada','fechado','perdido')),
  next_action text,
  next_action_date date,
  notes text,
  category text not null default 'pessoal' check (category in ('trabalho','pessoal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- ---------- ajustes para projetos que já tinham o schema com login ----------
alter table public.tasks alter column user_id drop not null;
alter table public.goals alter column user_id drop not null;
alter table public.events alter column user_id drop not null;
alter table public.clients alter column user_id drop not null;
alter table public.clients add column if not exists category text not null default 'pessoal' check (category in ('trabalho','pessoal'));

-- ---------- índices úteis ----------
create index if not exists tasks_user_due_idx on public.tasks (user_id, due_date);
create index if not exists goals_user_status_idx on public.goals (user_id, status);
create index if not exists events_user_date_idx on public.events (user_id, event_date);
create index if not exists clients_user_stage_idx on public.clients (user_id, stage);

-- ---------- Acesso sem login: leitura e escrita com a anon key ----------
alter table public.tasks enable row level security;
alter table public.goals enable row level security;
alter table public.events enable row level security;
alter table public.clients enable row level security;

drop policy if exists "tasks_owner" on public.tasks;
drop policy if exists "goals_owner" on public.goals;
drop policy if exists "events_owner" on public.events;
drop policy if exists "clients_owner" on public.clients;

drop policy if exists "tasks_public_access" on public.tasks;
create policy "tasks_public_access" on public.tasks
  for all to anon using (true) with check (true);

drop policy if exists "goals_public_access" on public.goals;
create policy "goals_public_access" on public.goals
  for all to anon using (true) with check (true);

drop policy if exists "events_public_access" on public.events;
create policy "events_public_access" on public.events
  for all to anon using (true) with check (true);

drop policy if exists "clients_public_access" on public.clients;
create policy "clients_public_access" on public.clients
  for all to anon using (true) with check (true);

-- ---------- updated_at automático ----------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

drop trigger if exists goals_set_updated_at on public.goals;
create trigger goals_set_updated_at before update on public.goals
  for each row execute function public.set_updated_at();

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at before update on public.clients
  for each row execute function public.set_updated_at();

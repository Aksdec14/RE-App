-- Restaurant Cloud · minimal license schema
-- Run this in the Supabase SQL editor.
--
-- Security model:
--   * RLS is enabled and no public policies are created.
--   * The cloud server uses SUPABASE_SECRET_KEY (service role) and bypasses RLS.
--   * The browser / restaurant app must never receive the secret key.
--   * Client license keys are stored as SHA-256 hashes, never as plaintext.

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  phone text not null default '',
  plan text not null default 'standard'
    check (plan in ('basic', 'standard', 'premium')),
  monthly_fee_paise integer not null
    check (monthly_fee_paise >= 0),
  status text not null default 'active'
    check (status in ('active', 'suspended')),
  due_date timestamptz not null,
  last_paid_at timestamptz,
  note text not null default '',
  client_key_hash text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clients_status_name
  on public.clients (status, name);

alter table public.clients enable row level security;
revoke all on table public.clients from anon, authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

comment on table public.clients is
  'Restaurant clients and license state. Only the cloud server service role can read or write.';
comment on column public.clients.client_key_hash is
  'SHA-256 hash of the license key. The plaintext key is returned only once, at create/rotate time.';

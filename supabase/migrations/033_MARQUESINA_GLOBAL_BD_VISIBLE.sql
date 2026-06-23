-- ============================================================================
-- GrupMar Time v16.19.23 - Marquesina visible global desde BD
--
-- Fuente única BD:
--   public.gmt_checkin_config
--   public.checkin_messages
--
-- Nada de localStorage / sessionStorage.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.gmt_checkin_config (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gmt_checkin_config_history (
  id uuid primary key default gen_random_uuid(),
  config_key text not null,
  settings jsonb not null,
  action text not null default 'save',
  created_by uuid null,
  created_at timestamptz not null default now()
);

create or replace function public.gmt_touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_gmt_checkin_config_touch on public.gmt_checkin_config;
create trigger trg_gmt_checkin_config_touch
before update on public.gmt_checkin_config
for each row execute function public.gmt_touch_updated_at();

alter table public.gmt_checkin_config enable row level security;
alter table public.gmt_checkin_config_history enable row level security;

drop policy if exists gmt_checkin_config_read_auth on public.gmt_checkin_config;
create policy gmt_checkin_config_read_auth
on public.gmt_checkin_config
for select
to authenticated
using (true);

drop policy if exists gmt_checkin_config_write_auth on public.gmt_checkin_config;
create policy gmt_checkin_config_write_auth
on public.gmt_checkin_config
for all
to authenticated
using (true)
with check (true);

drop policy if exists gmt_checkin_config_history_read_auth on public.gmt_checkin_config_history;
create policy gmt_checkin_config_history_read_auth
on public.gmt_checkin_config_history
for select
to authenticated
using (true);

drop policy if exists gmt_checkin_config_history_insert_auth on public.gmt_checkin_config_history;
create policy gmt_checkin_config_history_insert_auth
on public.gmt_checkin_config_history
for insert
to authenticated
with check (true);

create or replace function public.gmt_save_checkin_config(
  p_key text,
  p_settings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings jsonb;
begin
  if p_key is null or btrim(p_key) = '' then
    raise exception 'p_key obligatorio';
  end if;

  v_settings := coalesce(p_settings, '{}'::jsonb);

  insert into public.gmt_checkin_config(key, settings)
  values (p_key, v_settings)
  on conflict(key)
  do update set
    settings = excluded.settings,
    updated_at = now();

  insert into public.gmt_checkin_config_history(config_key, settings, action, created_by)
  values (p_key, v_settings, 'save', auth.uid());

  return v_settings;
end;
$$;

grant execute on function public.gmt_save_checkin_config(text, jsonb) to authenticated;

create or replace function public.gmt_get_checkin_config(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select settings from public.gmt_checkin_config where key = p_key limit 1),
    '{}'::jsonb
  );
$$;

grant execute on function public.gmt_get_checkin_config(text) to authenticated;

-- Registro base para que exista la clave. No inventa aviso visible si no hay texto.
insert into public.gmt_checkin_config(key, settings)
values (
  'company_ticker',
  jsonb_build_object(
    'enabled', true,
    'active', true,
    'items', coalesce(
      (select settings->'items' from public.gmt_checkin_config where key='company_ticker'),
      '[]'::jsonb
    ),
    'palette', coalesce(
      (select settings->>'palette' from public.gmt_checkin_config where key='company_ticker'),
      'corporate'
    ),
    'speedSeconds', coalesce(
      ((select settings->>'speedSeconds' from public.gmt_checkin_config where key='company_ticker')::int),
      26
    )
  )
)
on conflict(key) do nothing;

select key, settings
from public.gmt_checkin_config
where key = 'company_ticker';


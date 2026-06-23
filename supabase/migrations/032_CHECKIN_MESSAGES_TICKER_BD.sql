-- ============================================================================
-- GrupMar Time v16.19.21 - Comunicados y marquesina en BD
--
-- Objetivo:
-- - Mantener la UX original del editor de comunicados/marquesina.
-- - Cambiar persistencia localStorage por Supabase.
-- - Guardar historial de cada cambio.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.gmt_checkin_config (
  key text primary key check (key in ('checkin_messages', 'company_ticker')),
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.gmt_checkin_config_history (
  id uuid primary key default gen_random_uuid(),
  config_key text not null check (config_key in ('checkin_messages', 'company_ticker')),
  settings jsonb not null default '{}'::jsonb,
  action text not null default 'save',
  created_by uuid null,
  created_at timestamptz not null default now()
);

alter table public.gmt_checkin_config enable row level security;
alter table public.gmt_checkin_config_history enable row level security;

drop policy if exists gmt_checkin_config_read_auth on public.gmt_checkin_config;
create policy gmt_checkin_config_read_auth
on public.gmt_checkin_config
for select
to authenticated
using (true);

drop policy if exists gmt_checkin_config_history_read_auth on public.gmt_checkin_config_history;
create policy gmt_checkin_config_history_read_auth
on public.gmt_checkin_config_history
for select
to authenticated
using (true);

create or replace function public.gmt_get_checkin_config(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings jsonb;
begin
  if p_key not in ('checkin_messages', 'company_ticker') then
    raise exception 'Config key no permitida: %', p_key;
  end if;

  select c.settings
    into v_settings
  from public.gmt_checkin_config c
  where c.key = p_key;

  return coalesce(v_settings, '{}'::jsonb);
end;
$$;

create or replace function public.gmt_save_checkin_config(p_key text, p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings jsonb := coalesce(p_settings, '{}'::jsonb);
  v_uid uuid := auth.uid();
begin
  if p_key not in ('checkin_messages', 'company_ticker') then
    raise exception 'Config key no permitida: %', p_key;
  end if;

  insert into public.gmt_checkin_config(key, settings, updated_by, updated_at, created_at)
  values (p_key, v_settings, v_uid, now(), now())
  on conflict(key)
  do update set
    settings = excluded.settings,
    updated_by = excluded.updated_by,
    updated_at = now();

  insert into public.gmt_checkin_config_history(config_key, settings, action, created_by)
  values (p_key, v_settings, 'save', v_uid);

  return v_settings;
end;
$$;

grant execute on function public.gmt_get_checkin_config(text) to authenticated;
grant execute on function public.gmt_save_checkin_config(text, jsonb) to authenticated;

-- Inicialización mínima: crea filas vacías si no existen.
insert into public.gmt_checkin_config(key, settings)
values
  ('checkin_messages', '{}'::jsonb),
  ('company_ticker', '{}'::jsonb)
on conflict(key) do nothing;

-- Verificación.
select key, jsonb_typeof(settings) as settings_type, updated_at
from public.gmt_checkin_config
order by key;


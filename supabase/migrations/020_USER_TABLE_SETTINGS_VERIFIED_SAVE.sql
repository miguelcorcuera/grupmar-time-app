-- ============================================================================
-- GrupMar Time v16.17 - Guardado verificado de configuraciones de tabla
--
-- Objetivo:
-- - Si el usuario cambia cabeceras, la BD manda.
-- - No se permite fallo silencioso.
-- - RPC devuelve la fila realmente guardada.
-- ============================================================================

create table if not exists public.user_table_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  email text not null,
  table_key text not null,
  visible_columns text[] not null default array[]::text[],
  column_order text[] not null default array[]::text[],
  sort_key text null,
  sort_dir text not null default 'asc',
  density text not null default 'normal',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(email, table_key)
);

alter table public.user_table_settings
  add column if not exists settings jsonb not null default '{}'::jsonb,
  add column if not exists density text not null default 'normal';

alter table public.user_table_settings enable row level security;

drop policy if exists user_table_settings_select_own on public.user_table_settings;
create policy user_table_settings_select_own
on public.user_table_settings
for select
to authenticated
using (lower(email) = lower(coalesce(auth.jwt()->>'email','')));

drop policy if exists user_table_settings_write_own on public.user_table_settings;
create policy user_table_settings_write_own
on public.user_table_settings
for all
to authenticated
using (lower(email) = lower(coalesce(auth.jwt()->>'email','')))
with check (lower(email) = lower(coalesce(auth.jwt()->>'email','')));

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

drop trigger if exists trg_user_table_settings_touch on public.user_table_settings;
create trigger trg_user_table_settings_touch
before update on public.user_table_settings
for each row execute function public.gmt_touch_updated_at();

drop function if exists public.gmt_save_user_table_settings(text,text[],text[],text,text);

create function public.gmt_save_user_table_settings(
  p_table_key text,
  p_visible_columns text[],
  p_column_order text[],
  p_sort_key text,
  p_sort_dir text
)
returns public.user_table_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_user_id uuid := auth.uid();
  v_table_key text := trim(coalesce(p_table_key,''));
  v_visible text[] := coalesce(p_visible_columns, array[]::text[]);
  v_order text[] := coalesce(p_column_order, array[]::text[]);
  v_sort_key text := nullif(trim(coalesce(p_sort_key,'')), '');
  v_sort_dir text := case when lower(coalesce(p_sort_dir,'asc')) = 'desc' then 'desc' else 'asc' end;
  v_row public.user_table_settings;
begin
  if v_email is null or v_email = '' then
    raise exception 'email de sesión requerido para guardar configuración';
  end if;

  if v_table_key = '' then
    raise exception 'table_key requerido para guardar configuración';
  end if;

  if array_length(v_visible, 1) is null or array_length(v_visible, 1) = 0 then
    raise exception 'visible_columns no puede quedar vacío';
  end if;

  if array_length(v_order, 1) is null or array_length(v_order, 1) = 0 then
    v_order := v_visible;
  end if;

  insert into public.user_table_settings(
    user_id,
    email,
    table_key,
    visible_columns,
    column_order,
    sort_key,
    sort_dir,
    settings
  )
  values (
    v_user_id,
    v_email,
    v_table_key,
    v_visible,
    v_order,
    v_sort_key,
    v_sort_dir,
    jsonb_build_object(
      'saved_at', now(),
      'source', 'v16.17_verified_save'
    )
  )
  on conflict(email, table_key)
  do update set
    user_id = excluded.user_id,
    visible_columns = excluded.visible_columns,
    column_order = excluded.column_order,
    sort_key = excluded.sort_key,
    sort_dir = excluded.sort_dir,
    settings = coalesce(public.user_table_settings.settings, '{}'::jsonb) || excluded.settings,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.gmt_save_user_table_settings(text,text[],text[],text,text) to authenticated;

drop function if exists public.gmt_get_my_table_setting(text);

create function public.gmt_get_my_table_setting(p_table_key text)
returns public.user_table_settings
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.user_table_settings
  where lower(email) = lower(coalesce(auth.jwt()->>'email',''))
    and table_key = p_table_key
  limit 1;
$$;

grant execute on function public.gmt_get_my_table_setting(text) to authenticated;

drop function if exists public.gmt_my_table_settings();

create function public.gmt_my_table_settings()
returns setof public.user_table_settings
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.user_table_settings
  where lower(email) = lower(coalesce(auth.jwt()->>'email',''))
  order by table_key;
$$;

grant execute on function public.gmt_my_table_settings() to authenticated;


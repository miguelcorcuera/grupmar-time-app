-- ============================================================================
-- GrupMar Time v16.14 - Configuración canónica UI por usuario
--
-- Objetivo:
-- - Configuración portable por usuario: columnas, orden, sorting, módulos, tema.
-- - Textos UI editables por administrador.
-- - No duplica personal. Personal sigue en public.profiles.
-- ============================================================================

create table if not exists public.user_ui_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  email text not null,
  scope text not null default 'global',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(email, scope)
);

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(email, table_key)
);

create table if not exists public.ui_text_overrides (
  id uuid primary key default gen_random_uuid(),
  text_key text not null unique,
  value text not null,
  description text null,
  updated_by uuid null,
  updated_by_email text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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

drop trigger if exists trg_user_ui_settings_touch on public.user_ui_settings;
create trigger trg_user_ui_settings_touch
before update on public.user_ui_settings
for each row execute function public.gmt_touch_updated_at();

drop trigger if exists trg_user_table_settings_touch on public.user_table_settings;
create trigger trg_user_table_settings_touch
before update on public.user_table_settings
for each row execute function public.gmt_touch_updated_at();

drop trigger if exists trg_ui_text_overrides_touch on public.ui_text_overrides;
create trigger trg_ui_text_overrides_touch
before update on public.ui_text_overrides
for each row execute function public.gmt_touch_updated_at();

alter table public.user_ui_settings enable row level security;
alter table public.user_table_settings enable row level security;
alter table public.ui_text_overrides enable row level security;

drop policy if exists user_ui_settings_select_own on public.user_ui_settings;
create policy user_ui_settings_select_own
on public.user_ui_settings
for select
to authenticated
using (lower(email) = lower(coalesce(auth.jwt()->>'email','')));

drop policy if exists user_ui_settings_write_own on public.user_ui_settings;
create policy user_ui_settings_write_own
on public.user_ui_settings
for all
to authenticated
using (lower(email) = lower(coalesce(auth.jwt()->>'email','')))
with check (lower(email) = lower(coalesce(auth.jwt()->>'email','')));

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

drop policy if exists ui_text_overrides_read_all on public.ui_text_overrides;
create policy ui_text_overrides_read_all
on public.ui_text_overrides
for select
to authenticated
using (true);

drop policy if exists ui_text_overrides_admin_write on public.ui_text_overrides;
create policy ui_text_overrides_admin_write
on public.ui_text_overrides
for all
to authenticated
using (
  lower(coalesce(auth.jwt()->>'email','')) in (
    'ma.corcuera@grupomarport.com',
    'miguel.corcuera@gmail.com',
    'ma.corcuera@grupomarport.com'
  )
)
with check (
  lower(coalesce(auth.jwt()->>'email','')) in (
    'ma.corcuera@grupomarport.com',
    'miguel.corcuera@gmail.com',
    'ma.corcuera@grupomarport.com'
  )
);

create or replace function public.gmt_current_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt()->>'email',''));
$$;

create or replace function public.gmt_is_ui_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt()->>'email','')) in (
    'ma.corcuera@grupomarport.com',
    'miguel.corcuera@gmail.com',
    'ma.corcuera@grupomarport.com'
  );
$$;

grant execute on function public.gmt_current_email() to authenticated;
grant execute on function public.gmt_is_ui_admin() to authenticated;

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
  v_row public.user_table_settings;
begin
  if v_email is null or v_email = '' then
    raise exception 'email de sesión requerido';
  end if;

  insert into public.user_table_settings(
    user_id, email, table_key, visible_columns, column_order, sort_key, sort_dir
  )
  values (
    v_user_id,
    v_email,
    p_table_key,
    coalesce(p_visible_columns, array[]::text[]),
    coalesce(p_column_order, array[]::text[]),
    nullif(p_sort_key,''),
    case when lower(coalesce(p_sort_dir,'asc')) = 'desc' then 'desc' else 'asc' end
  )
  on conflict(email, table_key)
  do update set
    user_id = excluded.user_id,
    visible_columns = excluded.visible_columns,
    column_order = excluded.column_order,
    sort_key = excluded.sort_key,
    sort_dir = excluded.sort_dir,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.gmt_save_user_table_settings(text,text[],text[],text,text) to authenticated;

drop function if exists public.gmt_save_user_ui_settings(text,jsonb);
create function public.gmt_save_user_ui_settings(
  p_scope text,
  p_settings jsonb
)
returns public.user_ui_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_user_id uuid := auth.uid();
  v_row public.user_ui_settings;
begin
  if v_email is null or v_email = '' then
    raise exception 'email de sesión requerido';
  end if;

  insert into public.user_ui_settings(user_id, email, scope, settings)
  values (v_user_id, v_email, coalesce(nullif(p_scope,''),'global'), coalesce(p_settings,'{}'::jsonb))
  on conflict(email, scope)
  do update set
    user_id = excluded.user_id,
    settings = excluded.settings,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.gmt_save_user_ui_settings(text,jsonb) to authenticated;

drop function if exists public.gmt_save_ui_text_override(text,text,text);
create function public.gmt_save_ui_text_override(
  p_text_key text,
  p_value text,
  p_description text default null
)
returns public.ui_text_overrides
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_user_id uuid := auth.uid();
  v_row public.ui_text_overrides;
begin
  if not public.gmt_is_ui_admin() then
    raise exception 'No autorizado para editar textos UI';
  end if;

  insert into public.ui_text_overrides(text_key, value, description, updated_by, updated_by_email)
  values (p_text_key, coalesce(p_value,''), p_description, v_user_id, v_email)
  on conflict(text_key)
  do update set
    value = excluded.value,
    description = excluded.description,
    updated_by = excluded.updated_by,
    updated_by_email = excluded.updated_by_email,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.gmt_save_ui_text_override(text,text,text) to authenticated;

-- Seed de textos principales. Sólo se insertan si no existen.
insert into public.ui_text_overrides(text_key, value, description)
values
  ('admin.maintenance.kicker', 'Mantenimiento canónico', 'Cabecera superior de mantenimiento'),
  ('admin.maintenance.title', 'Catálogos y personal', 'Título principal de mantenimiento'),
  ('admin.maintenance.subtitle', 'Personal, empresas, áreas, centros, documentos, puestos y roles en una sola pantalla.', 'Subtítulo principal de mantenimiento'),
  ('dashboard.subtitle', 'Planifica, registra y controla todo tu equipo en tiempo real.', 'Subtítulo del dashboard')
on conflict(text_key) do nothing;



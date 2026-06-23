-- ============================================================================
-- GrupMar Time v16.10 - HOTFIX RPC CACHE + CATALOGOS
--
-- Reinstala RPCs mínimas y fuerza reload del schema cache de PostgREST.
-- ============================================================================

create table if not exists public.gmt_code_sequences (
  scope text primary key,
  prefix text not null,
  last_number integer not null default 0,
  padding integer not null default 3,
  updated_at timestamptz not null default now()
);

create or replace function public.gmt_next_code(p_scope text, p_prefix text, p_padding integer default 3)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  insert into public.gmt_code_sequences(scope, prefix, last_number, padding, updated_at)
  values (p_scope, p_prefix, 0, p_padding, now())
  on conflict (scope) do update
  set prefix = excluded.prefix, padding = excluded.padding, updated_at = now();

  update public.gmt_code_sequences
  set last_number = last_number + 1, updated_at = now()
  where scope = p_scope
  returning last_number into v_next;

  return p_prefix || lpad(v_next::text, p_padding, '0');
end;
$$;

create or replace function public.gmt_current_user_is_access_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.email(), ''));
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='user_roles'
  ) and exists (
    select 1 from public.user_roles
    where user_id = auth.uid()
      and lower(role) in ('admin','rrhh')
  ) then
    return true;
  end if;

  if v_email in ('ma.corcuera@grupomarport.com', 'miguel.corcuera@gmail.com') or v_email like '%admin%' then
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.gmt_allowed_catalog_table(p_catalog text)
returns text
language plpgsql
stable
as $$
begin
  case p_catalog
    when 'companies' then return 'companies';
    when 'departments' then return 'departments';
    when 'work_centers' then return 'work_centers';
    when 'document_types' then return 'document_types';
    when 'job_positions' then return 'job_positions';
    when 'access_role_catalog' then return 'access_role_catalog';
    else raise exception 'Catalogo no permitido: %', p_catalog;
  end case;
end;
$$;

create or replace function public.admin_catalog_list_records(p_catalog text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table text := public.gmt_allowed_catalog_table(p_catalog);
  v_result jsonb;
begin
  if not public.gmt_current_user_is_access_admin() then
    raise exception 'No autorizado';
  end if;

  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t', v_table)
  into v_result;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

create or replace function public.admin_catalog_save_record(p_catalog text, p_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table text := public.gmt_allowed_catalog_table(p_catalog);
  v_payload jsonb := p_payload;
  v_result jsonb;
begin
  if not public.gmt_current_user_is_access_admin() then
    raise exception 'No autorizado';
  end if;

  -- Esta función se deja como respaldo. La UI v16.10 intenta directo primero.
  if p_id is not null then
    execute format('update public.%I set active = coalesce(($1->>''active'')::boolean, true) where id = $2 returning to_jsonb(%I.*)', v_table, v_table)
    using v_payload, p_id
    into v_result;
    return v_result;
  end if;

  raise exception 'Usa guardado directo desde UI para insertar catálogos';
end;
$$;

grant execute on function public.gmt_next_code(text,text,integer) to authenticated;
grant execute on function public.gmt_current_user_is_access_admin() to authenticated;
grant execute on function public.gmt_allowed_catalog_table(text) to authenticated;
grant execute on function public.admin_catalog_list_records(text) to authenticated;
grant execute on function public.admin_catalog_save_record(text,uuid,jsonb) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- GrupMar Time v16.10.1 - HOTFIX app_role enum + RPC cache
--
-- Error actual:
--   function lower(app_role) does not exist
--
-- Causa:
--   user_roles.role es enum app_role, no text.
--   PostgreSQL no acepta lower(enum). Hay que usar role::text.
--
-- Este SQL:
-- - Corrige gmt_current_user_is_access_admin()
-- - Reinstala admin_catalog_list_records(...)
-- - Reinstala admin_catalog_save_record(...)
-- - Reinstala admin_catalog_delete_record(...)
-- - Fuerza reload schema cache de PostgREST
-- ============================================================================

create table if not exists public.gmt_code_sequences (
  scope text primary key,
  prefix text not null,
  last_number integer not null default 0,
  padding integer not null default 3,
  updated_at timestamptz not null default now()
);

create or replace function public.gmt_next_code(
  p_scope text,
  p_prefix text,
  p_padding integer default 3
)
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
  set prefix = excluded.prefix,
      padding = excluded.padding,
      updated_at = now();

  update public.gmt_code_sequences
  set last_number = last_number + 1,
      updated_at = now()
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
  v_is_admin boolean := false;
  v_has_profile_role boolean := false;
begin
  -- user_roles.role puede ser enum app_role: SIEMPRE castear a text.
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'user_roles'
  ) then
    select exists (
      select 1
      from public.user_roles ur
      where ur.user_id = auth.uid()
        and lower(coalesce(ur.role::text, '')) in ('admin', 'rrhh')
    )
    into v_is_admin;

    if v_is_admin then
      return true;
    end if;
  end if;

  -- profiles.role sólo si existe físicamente.
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'role'
  )
  into v_has_profile_role;

  if v_has_profile_role then
    execute $q$
      select exists (
        select 1
        from public.profiles p
        where (p.user_id = auth.uid() or lower(p.email) = lower(coalesce(auth.email(), '')))
          and coalesce(p.active, true) = true
          and lower(coalesce(p.role::text, '')) in ('admin', 'rrhh')
      )
    $q$
    into v_is_admin;

    if v_is_admin then
      return true;
    end if;
  end if;

  -- Fallback controlado durante migración.
  if v_email in ('ma.corcuera@grupomarport.com', 'miguel.corcuera@gmail.com')
     or v_email like '%admin%' then
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

create or replace function public.gmt_table_has_column(p_table text, p_column text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table
      and column_name = p_column
  );
$$;

create or replace function public.gmt_catalog_prefix(p_table text)
returns text
language sql
immutable
as $$
  select case p_table
    when 'companies' then 'EMP'
    when 'departments' then 'ARE'
    when 'work_centers' then 'CEN'
    when 'document_types' then 'DOC'
    when 'job_positions' then 'PUE'
    when 'access_role_catalog' then 'ROL'
    else 'COD'
  end;
$$;

create or replace function public.gmt_slugify(p_text text)
returns text
language plpgsql
immutable
as $$
declare
  v text;
begin
  v := lower(coalesce(p_text, ''));
  v := translate(v, 'áéíóúàèìòùäëïöüâêîôûñçÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛÑÇ', 'aeiouaeiouaeiouaeiouncAEIOUAEIOUAEIOUAEIOUNC');
  v := regexp_replace(v, '[^a-z0-9]+', '_', 'g');
  v := regexp_replace(v, '^_+|_+$', '', 'g');
  return coalesce(nullif(v, ''), 'item');
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

  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = v_table
  ) then
    return '[]'::jsonb;
  end if;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t',
    v_table
  )
  into v_result;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

create or replace function public.admin_catalog_save_record(
  p_catalog text,
  p_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table text := public.gmt_allowed_catalog_table(p_catalog);
  v_id uuid := p_id;
  v_name text := nullif(trim(coalesce(p_payload->>'name', p_payload->>'label', p_payload->>'role')), '');
  v_label text := nullif(trim(coalesce(p_payload->>'label', p_payload->>'name')), '');
  v_role text := nullif(trim(coalesce(p_payload->>'role', public.gmt_slugify(coalesce(p_payload->>'label', p_payload->>'name')))), '');
  v_company_name text := nullif(trim(coalesce(p_payload->>'company_name', p_payload->>'company')), '');
  v_active boolean := coalesce((p_payload->>'active')::boolean, true);
  v_code text;
  v_cols text[] := array[]::text[];
  v_vals text[] := array[]::text[];
  v_set text[] := array[]::text[];
  v_sql text;
  v_result jsonb;
begin
  if not public.gmt_current_user_is_access_admin() then
    raise exception 'No autorizado';
  end if;

  if v_name is null and v_label is null and v_role is null then
    raise exception 'Nombre requerido';
  end if;

  -- UPDATE
  if v_id is not null then
    if public.gmt_table_has_column(v_table, 'name') then
      v_set := v_set || format('name = %L', coalesce(v_name, v_label, v_role));
    end if;

    if public.gmt_table_has_column(v_table, 'label') then
      v_set := v_set || format('label = %L', coalesce(v_label, v_name, v_role));
    end if;

    if public.gmt_table_has_column(v_table, 'role') then
      -- role puede ser enum app_role: castear en SQL dinámico si existe la columna.
      v_set := v_set || format('role = %L', coalesce(v_role, public.gmt_slugify(coalesce(v_label, v_name))));
    end if;

    if public.gmt_table_has_column(v_table, 'company_name') then
      v_set := v_set || format('company_name = %L', coalesce(v_company_name, 'Grupo Marport'));
    end if;

    if public.gmt_table_has_column(v_table, 'description') then
      v_set := v_set || format('description = %L', nullif(trim(p_payload->>'description'), ''));
    end if;

    if public.gmt_table_has_column(v_table, 'active') then
      v_set := v_set || format('active = %L::boolean', v_active);
    end if;

    if public.gmt_table_has_column(v_table, 'updated_at') then
      v_set := v_set || 'updated_at = now()';
    end if;

    if array_length(v_set, 1) is null then
      raise exception 'No hay columnas actualizables para %', v_table;
    end if;

    v_sql := format(
      'update public.%I set %s where id = %L::uuid returning to_jsonb(%I.*)',
      v_table,
      array_to_string(v_set, ', '),
      v_id,
      v_table
    );

    execute v_sql into v_result;
    return v_result;
  end if;

  -- INSERT: codigo automático si la tabla tiene code.
  if public.gmt_table_has_column(v_table, 'code') then
    v_code := public.gmt_next_code(v_table, public.gmt_catalog_prefix(v_table), 3);
    v_cols := v_cols || 'code';
    v_vals := v_vals || format('%L', v_code);
  end if;

  if public.gmt_table_has_column(v_table, 'name') then
    v_cols := v_cols || 'name';
    v_vals := v_vals || format('%L', coalesce(v_name, v_label, v_role));
  end if;

  if public.gmt_table_has_column(v_table, 'label') then
    v_cols := v_cols || 'label';
    v_vals := v_vals || format('%L', coalesce(v_label, v_name, v_role));
  end if;

  if public.gmt_table_has_column(v_table, 'role') then
    v_cols := v_cols || 'role';
    v_vals := v_vals || format('%L', coalesce(v_role, public.gmt_slugify(coalesce(v_label, v_name))));
  end if;

  if public.gmt_table_has_column(v_table, 'company_name') then
    v_cols := v_cols || 'company_name';
    v_vals := v_vals || format('%L', coalesce(v_company_name, 'Grupo Marport'));
  end if;

  if public.gmt_table_has_column(v_table, 'description') then
    v_cols := v_cols || 'description';
    v_vals := v_vals || format('%L', nullif(trim(p_payload->>'description'), ''));
  end if;

  if public.gmt_table_has_column(v_table, 'active') then
    v_cols := v_cols || 'active';
    v_vals := v_vals || format('%L::boolean', v_active);
  end if;

  if public.gmt_table_has_column(v_table, 'created_at') then
    v_cols := v_cols || 'created_at';
    v_vals := v_vals || 'now()';
  end if;

  if public.gmt_table_has_column(v_table, 'updated_at') then
    v_cols := v_cols || 'updated_at';
    v_vals := v_vals || 'now()';
  end if;

  if array_length(v_cols, 1) is null then
    raise exception 'No hay columnas insertables para %', v_table;
  end if;

  v_sql := format(
    'insert into public.%I (%s) values (%s) returning to_jsonb(%I.*)',
    v_table,
    array_to_string(v_cols, ', '),
    array_to_string(v_vals, ', '),
    v_table
  );

  execute v_sql into v_result;
  return v_result;
end;
$$;

create or replace function public.admin_catalog_delete_record(
  p_catalog text,
  p_id uuid
)
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

  if public.gmt_table_has_column(v_table, 'active') then
    execute format(
      'update public.%I set active = false where id = %L::uuid returning to_jsonb(%I.*)',
      v_table,
      p_id,
      v_table
    )
    into v_result;
  else
    execute format(
      'delete from public.%I where id = %L::uuid returning to_jsonb(%I.*)',
      v_table,
      p_id,
      v_table
    )
    into v_result;
  end if;

  return v_result;
end;
$$;

grant execute on function public.gmt_next_code(text,text,integer) to authenticated;
grant execute on function public.gmt_current_user_is_access_admin() to authenticated;
grant execute on function public.gmt_allowed_catalog_table(text) to authenticated;
grant execute on function public.gmt_table_has_column(text,text) to authenticated;
grant execute on function public.gmt_catalog_prefix(text) to authenticated;
grant execute on function public.gmt_slugify(text) to authenticated;
grant execute on function public.admin_catalog_list_records(text) to authenticated;
grant execute on function public.admin_catalog_save_record(text,uuid,jsonb) to authenticated;
grant execute on function public.admin_catalog_delete_record(text,uuid) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- GrupMar Time v16.9 - GUARDADO REAL + CODIGOS AUTOMATICOS SIN INPUT
--
-- Regla:
-- Ningun formulario debe pedir codigo manual.
-- La BD genera codigos.
--
-- Incluye:
-- 1) admin_access_save_profile(jsonb) corregida para BD sin profiles.role.
-- 2) admin_catalog_list_records(text)
-- 3) admin_catalog_save_record(text, uuid, jsonb)
-- 4) admin_catalog_delete_record(text, uuid)
-- 5) limpieza de maintenance_catalog_definitions.fields para quitar code/codigo.
-- ============================================================================

create table if not exists public.gmt_code_sequences (
  scope text primary key,
  prefix text not null,
  last_number integer not null default 0,
  padding integer not null default 3,
  updated_at timestamptz not null default now()
);

alter table public.gmt_code_sequences enable row level security;

drop policy if exists "gmt_code_sequences_admin_select" on public.gmt_code_sequences;
create policy "gmt_code_sequences_admin_select"
on public.gmt_code_sequences
for select
to authenticated
using (true);

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

create or replace function public.gmt_current_user_is_access_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_profile_role boolean := false;
  v_is_admin boolean := false;
  v_email text := lower(coalesce(auth.email(), ''));
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='role'
  ) into v_has_profile_role;

  if exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='user_roles'
  ) then
    select exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and lower(coalesce(ur.role, '')) in ('admin', 'rrhh')
    ) into v_is_admin;

    if v_is_admin then return true; end if;
  end if;

  if v_has_profile_role then
    execute $q$
      select exists (
        select 1
        from public.profiles p
        where (p.user_id = auth.uid() or lower(p.email) = lower(coalesce(auth.email(), '')))
          and coalesce(p.active, true) = true
          and lower(coalesce(p.role, '')) in ('admin', 'rrhh')
      )
    $q$ into v_is_admin;

    if v_is_admin then return true; end if;
  end if;

  if v_email in ('ma.corcuera@grupomarport.com', 'miguel.corcuera@gmail.com')
     or v_email like '%admin%' then
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.gmt_table_has_column(p_table text, p_column text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name=p_table and column_name=p_column
  );
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

create or replace function public.admin_catalog_list_records(p_catalog text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table text := public.gmt_allowed_catalog_table(p_catalog);
  v_sql text;
  v_result jsonb;
begin
  if not public.gmt_current_user_is_access_admin() then
    raise exception 'No autorizado';
  end if;

  if not exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name=v_table
  ) then
    return '[]'::jsonb;
  end if;

  v_sql := format(
    'select coalesce(jsonb_agg(to_jsonb(t) order by coalesce(t.name::text, t.label::text, t.role::text, t.code::text, t.id::text)), ''[]''::jsonb) from public.%I t',
    v_table
  );

  -- Si no tiene algunas columnas del order, usar fallback simple.
  begin
    execute v_sql into v_result;
  exception when undefined_column then
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t', v_table) into v_result;
  end;

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
  v_name text := nullif(trim(coalesce(p_payload->>'name', p_payload->>'label', p_payload->>'area', p_payload->>'center', p_payload->>'position', p_payload->>'document_type')), '');
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

  if not exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name=v_table
  ) then
    raise exception 'No existe tabla public.%', v_table;
  end if;

  if v_name is null and v_label is null and v_role is null then
    raise exception 'Nombre requerido';
  end if;

  -- Código SIEMPRE automático. Nunca viene del formulario.
  if public.gmt_table_has_column(v_table, 'code') and v_id is null then
    v_code := public.gmt_next_code(v_table, public.gmt_catalog_prefix(v_table), 3);
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

  -- INSERT
  if public.gmt_table_has_column(v_table, 'code') then
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
    execute format('update public.%I set active = false where id = %L::uuid returning to_jsonb(%I.*)', v_table, p_id, v_table)
    into v_result;
  else
    execute format('delete from public.%I where id = %L::uuid returning to_jsonb(%I.*)', v_table, p_id, v_table)
    into v_result;
  end if;

  return v_result;
end;
$$;

-- RPC de perfiles corregida sin asumir profiles.role.
create or replace function public.admin_access_save_profile(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(p_payload->>'profile_id', '')::uuid;
  v_user_id uuid := nullif(p_payload->>'user_id', '')::uuid;
  v_email text := lower(nullif(trim(p_payload->>'email'), ''));
  v_full_name text := nullif(trim(p_payload->>'full_name'), '');
  v_role text := coalesce(nullif(trim(p_payload->>'role'), ''), 'employee');
  v_existing_id uuid;
  v_sql text;
  v_set_parts text[] := array[]::text[];
  v_cols text[] := array[]::text[];
  v_vals text[] := array[]::text[];
  v_result jsonb;
begin
  if not public.gmt_current_user_is_access_admin() then
    raise exception 'No autorizado para guardar accesos';
  end if;

  if v_email is null then raise exception 'Email requerido'; end if;
  if v_full_name is null then raise exception 'Nombre requerido'; end if;

  if v_id is null then
    if v_user_id is not null and public.gmt_table_has_column('profiles', 'user_id') then
      select id into v_existing_id from public.profiles where user_id = v_user_id limit 1;
    end if;

    if v_existing_id is null then
      select id into v_existing_id from public.profiles where lower(email) = v_email order by created_at nulls last limit 1;
    end if;

    v_id := v_existing_id;
  end if;

  if v_id is not null then
    if public.gmt_table_has_column('profiles', 'email') then v_set_parts := v_set_parts || format('email = %L', v_email); end if;
    if public.gmt_table_has_column('profiles', 'full_name') then v_set_parts := v_set_parts || format('full_name = %L', v_full_name); end if;
    if public.gmt_table_has_column('profiles', 'role') then v_set_parts := v_set_parts || format('role = %L', v_role); end if;
    if public.gmt_table_has_column('profiles', 'user_id') and v_user_id is not null then v_set_parts := v_set_parts || format('user_id = %L::uuid', v_user_id); end if;
    if public.gmt_table_has_column('profiles', 'employee_code') and nullif(trim(p_payload->>'employee_code'), '') is not null then v_set_parts := v_set_parts || format('employee_code = %L', nullif(trim(p_payload->>'employee_code'), '')); end if;
    if public.gmt_table_has_column('profiles', 'document_type') then v_set_parts := v_set_parts || format('document_type = %L', nullif(trim(p_payload->>'document_type'), '')); end if;
    if public.gmt_table_has_column('profiles', 'document_number') then v_set_parts := v_set_parts || format('document_number = %L', nullif(trim(p_payload->>'document_number'), '')); end if;
    if public.gmt_table_has_column('profiles', 'department') then v_set_parts := v_set_parts || format('department = %L', nullif(trim(p_payload->>'department'), '')); end if;
    if public.gmt_table_has_column('profiles', 'work_center') then v_set_parts := v_set_parts || format('work_center = %L', nullif(trim(p_payload->>'work_center'), '')); end if;
    if public.gmt_table_has_column('profiles', 'company_name') then v_set_parts := v_set_parts || format('company_name = %L', coalesce(nullif(trim(p_payload->>'company_name'), ''), 'Grupo Marport')); end if;
    if public.gmt_table_has_column('profiles', 'active') then v_set_parts := v_set_parts || format('active = %L::boolean', coalesce((p_payload->>'active')::boolean, true)); end if;

    v_sql := format('update public.profiles set %s where id = %L::uuid returning to_jsonb(profiles.*)', array_to_string(v_set_parts, ', '), v_id);
    execute v_sql into v_result;
  else
    if public.gmt_table_has_column('profiles', 'user_id') and v_user_id is not null then v_cols := v_cols || 'user_id'; v_vals := v_vals || format('%L::uuid', v_user_id); end if;
    if public.gmt_table_has_column('profiles', 'email') then v_cols := v_cols || 'email'; v_vals := v_vals || format('%L', v_email); end if;
    if public.gmt_table_has_column('profiles', 'full_name') then v_cols := v_cols || 'full_name'; v_vals := v_vals || format('%L', v_full_name); end if;
    if public.gmt_table_has_column('profiles', 'role') then v_cols := v_cols || 'role'; v_vals := v_vals || format('%L', v_role); end if;
    if public.gmt_table_has_column('profiles', 'employee_code') and nullif(trim(p_payload->>'employee_code'), '') is not null then v_cols := v_cols || 'employee_code'; v_vals := v_vals || format('%L', nullif(trim(p_payload->>'employee_code'), '')); end if;
    if public.gmt_table_has_column('profiles', 'document_type') then v_cols := v_cols || 'document_type'; v_vals := v_vals || format('%L', nullif(trim(p_payload->>'document_type'), '')); end if;
    if public.gmt_table_has_column('profiles', 'document_number') then v_cols := v_cols || 'document_number'; v_vals := v_vals || format('%L', nullif(trim(p_payload->>'document_number'), '')); end if;
    if public.gmt_table_has_column('profiles', 'department') then v_cols := v_cols || 'department'; v_vals := v_vals || format('%L', nullif(trim(p_payload->>'department'), '')); end if;
    if public.gmt_table_has_column('profiles', 'work_center') then v_cols := v_cols || 'work_center'; v_vals := v_vals || format('%L', nullif(trim(p_payload->>'work_center'), '')); end if;
    if public.gmt_table_has_column('profiles', 'company_name') then v_cols := v_cols || 'company_name'; v_vals := v_vals || format('%L', coalesce(nullif(trim(p_payload->>'company_name'), ''), 'Grupo Marport')); end if;
    if public.gmt_table_has_column('profiles', 'active') then v_cols := v_cols || 'active'; v_vals := v_vals || format('%L::boolean', coalesce((p_payload->>'active')::boolean, true)); end if;

    v_sql := format('insert into public.profiles (%s) values (%s) returning to_jsonb(profiles.*)', array_to_string(v_cols, ', '), array_to_string(v_vals, ', '));
    execute v_sql into v_result;
  end if;

  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='user_roles')
     and coalesce(v_result->>'user_id', '') <> '' then
    begin
      delete from public.user_roles where user_id = (v_result->>'user_id')::uuid;
      insert into public.user_roles(user_id, role) values ((v_result->>'user_id')::uuid, v_role);
    exception when others then null;
    end;
  end if;

  return v_result;
end;
$$;

-- Quitar campos codigo/code de definiciones dinámicas para que la UI antigua tampoco los pinte.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='maintenance_catalog_definitions'
  )
  and exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='maintenance_catalog_definitions' and column_name='fields'
  ) then
    update public.maintenance_catalog_definitions
    set fields = (
      select coalesce(jsonb_agg(elem), '[]'::jsonb)
      from jsonb_array_elements(fields) elem
      where lower(coalesce(elem->>'key', elem->>'name', elem->>'column', elem->>'field', '')) not in ('code', 'codigo', 'employee_code')
        and lower(coalesce(elem->>'label', '')) not in ('codigo', 'código', 'code')
    )
    where jsonb_typeof(fields) = 'array';
  end if;
end $$;

grant execute on function public.gmt_next_code(text,text,integer) to authenticated;
grant execute on function public.gmt_slugify(text) to authenticated;
grant execute on function public.gmt_current_user_is_access_admin() to authenticated;
grant execute on function public.gmt_table_has_column(text,text) to authenticated;
grant execute on function public.gmt_allowed_catalog_table(text) to authenticated;
grant execute on function public.gmt_catalog_prefix(text) to authenticated;
grant execute on function public.admin_catalog_list_records(text) to authenticated;
grant execute on function public.admin_catalog_save_record(text,uuid,jsonb) to authenticated;
grant execute on function public.admin_catalog_delete_record(text,uuid) to authenticated;
grant execute on function public.admin_access_save_profile(jsonb) to authenticated;

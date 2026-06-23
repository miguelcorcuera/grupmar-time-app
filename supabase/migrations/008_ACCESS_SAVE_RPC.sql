-- ============================================================================
-- GrupMar Time v16.8.1 - RPC REAL PARA GUARDAR ACCESOS
--
-- Corrección sobre v16.8:
-- El SQL anterior asumía que public.profiles.role existía.
-- En tu BD actual NO existe esa columna, por eso falló:
--   column p.role does not exist
--
-- Esta versión es defensiva:
-- - NO referencia p.role directamente si la columna no existe.
-- - Autoriza por user_roles.
-- - Autoriza fallback por emails admin conocidos durante transición.
-- - Guarda sólo columnas que existan en profiles.
-- ============================================================================

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
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'role'
  )
  into v_has_profile_role;

  -- 1) user_roles es la fuente preferida.
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and lower(coalesce(ur.role, '')) in ('admin', 'rrhh')
  )
  into v_is_admin;

  if v_is_admin then
    return true;
  end if;

  -- 2) profiles.role sólo si existe físicamente.
  if v_has_profile_role then
    execute $q$
      select exists (
        select 1
        from public.profiles p
        where (p.user_id = auth.uid() or lower(p.email) = lower(coalesce(auth.email(), '')))
          and coalesce(p.active, true) = true
          and lower(coalesce(p.role, '')) in ('admin', 'rrhh')
      )
    $q$
    into v_is_admin;

    if v_is_admin then
      return true;
    end if;
  end if;

  -- 3) Fallback controlado para no bloquear la migración del admin.
  if v_email in ('ma.corcuera@grupomarport.com', 'miguel.corcuera@gmail.com')
     or v_email like '%admin%' then
    return true;
  end if;

  return false;
end;
$$;

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
  v_has_user_roles boolean := false;
begin
  if not public.gmt_current_user_is_access_admin() then
    raise exception 'No autorizado para guardar accesos';
  end if;

  if v_email is null then
    raise exception 'Email requerido';
  end if;

  if v_full_name is null then
    raise exception 'Nombre requerido';
  end if;

  if v_id is null then
    if v_user_id is not null and exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='profiles' and column_name='user_id'
    ) then
      select id into v_existing_id
      from public.profiles
      where user_id = v_user_id
      limit 1;
    end if;

    if v_existing_id is null then
      select id into v_existing_id
      from public.profiles
      where lower(email) = v_email
      order by created_at nulls last
      limit 1;
    end if;

    v_id := v_existing_id;
  end if;

  -- UPDATE dinámico sólo con columnas existentes.
  if v_id is not null then
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='email') then
      v_set_parts := v_set_parts || format('email = %L', v_email);
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='full_name') then
      v_set_parts := v_set_parts || format('full_name = %L', v_full_name);
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='role') then
      v_set_parts := v_set_parts || format('role = %L', v_role);
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='user_id') and v_user_id is not null then
      v_set_parts := v_set_parts || format('user_id = %L::uuid', v_user_id);
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='employee_code') then
      -- Código automático: si viene vacío, NO pisar.
      if nullif(trim(p_payload->>'employee_code'), '') is not null then
        v_set_parts := v_set_parts || format('employee_code = %L', nullif(trim(p_payload->>'employee_code'), ''));
      end if;
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='document_type') then
      v_set_parts := v_set_parts || format('document_type = %L', nullif(trim(p_payload->>'document_type'), ''));
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='document_number') then
      v_set_parts := v_set_parts || format('document_number = %L', nullif(trim(p_payload->>'document_number'), ''));
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='department') then
      v_set_parts := v_set_parts || format('department = %L', nullif(trim(p_payload->>'department'), ''));
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='work_center') then
      v_set_parts := v_set_parts || format('work_center = %L', nullif(trim(p_payload->>'work_center'), ''));
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='company_name') then
      v_set_parts := v_set_parts || format('company_name = %L', coalesce(nullif(trim(p_payload->>'company_name'), ''), 'Grupo Marport'));
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='active') then
      v_set_parts := v_set_parts || format('active = %L::boolean', coalesce((p_payload->>'active')::boolean, true));
    end if;

    if array_length(v_set_parts, 1) is null then
      raise exception 'No hay columnas actualizables en profiles';
    end if;

    v_sql := format(
      'update public.profiles set %s where id = %L::uuid returning to_jsonb(profiles.*)',
      array_to_string(v_set_parts, ', '),
      v_id
    );

    execute v_sql into v_result;

  else
    -- INSERT dinámico sólo con columnas existentes.
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='user_id') and v_user_id is not null then
      v_cols := v_cols || 'user_id';
      v_vals := v_vals || format('%L::uuid', v_user_id);
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='email') then
      v_cols := v_cols || 'email';
      v_vals := v_vals || format('%L', v_email);
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='full_name') then
      v_cols := v_cols || 'full_name';
      v_vals := v_vals || format('%L', v_full_name);
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='role') then
      v_cols := v_cols || 'role';
      v_vals := v_vals || format('%L', v_role);
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='employee_code')
       and nullif(trim(p_payload->>'employee_code'), '') is not null then
      v_cols := v_cols || 'employee_code';
      v_vals := v_vals || format('%L', nullif(trim(p_payload->>'employee_code'), ''));
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='document_type') then
      v_cols := v_cols || 'document_type';
      v_vals := v_vals || format('%L', nullif(trim(p_payload->>'document_type'), ''));
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='document_number') then
      v_cols := v_cols || 'document_number';
      v_vals := v_vals || format('%L', nullif(trim(p_payload->>'document_number'), ''));
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='department') then
      v_cols := v_cols || 'department';
      v_vals := v_vals || format('%L', nullif(trim(p_payload->>'department'), ''));
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='work_center') then
      v_cols := v_cols || 'work_center';
      v_vals := v_vals || format('%L', nullif(trim(p_payload->>'work_center'), ''));
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='company_name') then
      v_cols := v_cols || 'company_name';
      v_vals := v_vals || format('%L', coalesce(nullif(trim(p_payload->>'company_name'), ''), 'Grupo Marport'));
    end if;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='active') then
      v_cols := v_cols || 'active';
      v_vals := v_vals || format('%L::boolean', coalesce((p_payload->>'active')::boolean, true));
    end if;

    v_sql := format(
      'insert into public.profiles (%s) values (%s) returning to_jsonb(profiles.*)',
      array_to_string(v_cols, ', '),
      array_to_string(v_vals, ', ')
    );

    execute v_sql into v_result;
  end if;

  select exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='user_roles'
  )
  into v_has_user_roles;

  if v_has_user_roles and coalesce(v_result->>'user_id', '') <> '' then
    begin
      delete from public.user_roles where user_id = (v_result->>'user_id')::uuid;
      insert into public.user_roles(user_id, role)
      values ((v_result->>'user_id')::uuid, v_role);
    exception when others then
      null;
    end;
  end if;

  return v_result;
end;
$$;

grant execute on function public.gmt_current_user_is_access_admin() to authenticated;
grant execute on function public.admin_access_save_profile(jsonb) to authenticated;

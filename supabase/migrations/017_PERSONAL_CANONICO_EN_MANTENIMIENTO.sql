-- ============================================================================
-- GrupMar Time v16.13 - Personal canónico en Mantenimiento
--
-- Tabla canónica: public.profiles
-- No se crean tablas nuevas para personal.
-- ============================================================================

alter table public.profiles
  add column if not exists role text,
  add column if not exists employee_code text,
  add column if not exists document_type text,
  add column if not exists document_number text,
  add column if not exists department text,
  add column if not exists work_center text,
  add column if not exists company_name text,
  add column if not exists birth_date date,
  add column if not exists phone text,
  add column if not exists job_position text,
  add column if not exists active boolean not null default true;

comment on table public.profiles is
'Personal canónico de GrupMar Time. Accesos, cumpleaños, roles, centro, área y datos del trabajador viven aquí.';

create or replace function public.gmt_next_profile_employee_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  select coalesce(max(nullif(regexp_replace(employee_code, '\D', '', 'g'), '')::integer), 0) + 1
    into v_next
  from public.profiles
  where employee_code is not null
    and employee_code ~ '[0-9]';

  return 'PER-' || lpad(v_next::text, 5, '0');
exception when others then
  return 'PER-' || to_char(now(), 'YYYYMMDDHH24MISS');
end;
$$;

create or replace function public.gmt_profiles_autocode()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(new.employee_code, '') is null then
    new.employee_code := public.gmt_next_profile_employee_code();
  end if;

  if nullif(new.company_name, '') is null then
    new.company_name := 'Grupo Marport';
  end if;

  if new.active is null then
    new.active := true;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_autocode on public.profiles;
create trigger trg_profiles_autocode
before insert on public.profiles
for each row execute function public.gmt_profiles_autocode();

create or replace function public.admin_access_save_profile(p_payload jsonb)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_profile_id uuid := nullif(p_payload->>'profile_id','')::uuid;
  v_user_id uuid := nullif(p_payload->>'user_id','')::uuid;
  v_email text := lower(nullif(p_payload->>'email',''));
  v_full_name text := nullif(p_payload->>'full_name','');
  v_role text := coalesce(nullif(p_payload->>'role',''), 'employee');
  v_employee_code text := nullif(p_payload->>'employee_code','');
  v_document_type text := nullif(p_payload->>'document_type','');
  v_document_number text := nullif(p_payload->>'document_number','');
  v_department text := nullif(p_payload->>'department','');
  v_work_center text := nullif(p_payload->>'work_center','');
  v_company_name text := coalesce(nullif(p_payload->>'company_name',''), 'Grupo Marport');
  v_birth_date date := nullif(p_payload->>'birth_date','')::date;
  v_phone text := nullif(p_payload->>'phone','');
  v_job_position text := nullif(p_payload->>'job_position','');
  v_active boolean := coalesce((p_payload->>'active')::boolean, true);
begin
  if v_email is null then
    raise exception 'email requerido';
  end if;

  if v_profile_id is null then
    select p.id into v_profile_id
    from public.profiles p
    where lower(p.email) = v_email
       or (v_user_id is not null and p.user_id = v_user_id)
    order by case when p.user_id = v_user_id then 0 else 1 end
    limit 1;
  end if;

  if v_profile_id is not null then
    update public.profiles
       set user_id = coalesce(v_user_id, user_id),
           email = v_email,
           full_name = coalesce(v_full_name, full_name, v_email),
           role = v_role,
           employee_code = coalesce(v_employee_code, employee_code),
           document_type = v_document_type,
           document_number = v_document_number,
           department = v_department,
           work_center = v_work_center,
           company_name = v_company_name,
           birth_date = v_birth_date,
           phone = v_phone,
           job_position = v_job_position,
           active = v_active
     where id = v_profile_id
     returning * into v_profile;
  else
    insert into public.profiles (
      user_id, email, full_name, role, employee_code,
      document_type, document_number, department, work_center,
      company_name, birth_date, phone, job_position, active
    )
    values (
      v_user_id, v_email, coalesce(v_full_name, v_email), v_role, v_employee_code,
      v_document_type, v_document_number, v_department, v_work_center,
      v_company_name, v_birth_date, v_phone, v_job_position, v_active
    )
    returning * into v_profile;
  end if;

  begin
    if v_profile.user_id is not null then
      delete from public.user_roles where user_id = v_profile.user_id;
      insert into public.user_roles(user_id, role)
      values (v_profile.user_id, v_role::public.app_role);
    end if;
  exception when others then
    null;
  end;

  return v_profile;
end;
$$;

grant execute on function public.admin_access_save_profile(jsonb) to authenticated;
grant execute on function public.gmt_next_profile_employee_code() to authenticated;

-- RPC masiva para importación. Recibe array JSON de personal.
create or replace function public.admin_profiles_bulk_upsert(p_rows jsonb)
returns table (
  ok boolean,
  total integer,
  saved integer,
  errors jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_saved integer := 0;
  v_total integer := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows debe ser array jsonb';
  end if;

  for v_item in select * from jsonb_array_elements(p_rows)
  loop
    v_total := v_total + 1;
    begin
      perform public.admin_access_save_profile(v_item);
      v_saved := v_saved + 1;
    exception when others then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'row', v_total,
        'email', v_item->>'email',
        'error', sqlerrm
      ));
    end;
  end loop;

  return query select true, v_total, v_saved, v_errors;
end;
$$;

grant execute on function public.admin_profiles_bulk_upsert(jsonb) to authenticated;

-- Vista liviana para exportar/listar personal.
create or replace view public.v_admin_personal as
select
  id,
  user_id,
  employee_code,
  full_name,
  email,
  role,
  company_name,
  department,
  work_center,
  job_position,
  document_type,
  document_number,
  birth_date,
  phone,
  active,
  created_at,
  updated_at
from public.profiles;

grant select on public.v_admin_personal to authenticated;

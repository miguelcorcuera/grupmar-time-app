begin;

-- FASE 1.6H - Modelo canonico de alcance de jefaturas/gerentes
-- Tabla canonica:
--   public.management_scopes
--
-- Objetivo:
--   Separar QUE puede hacer un usuario de SOBRE QUIEN puede hacerlo.
--
-- Capas canonicas:
--   access_profiles.module_permissions = permisos funcionales
--   management_scopes = alcance real de jefaturas/gerentes/coordinadores
--   holiday_work_authorizations = autorizacion canonica para trabajar/marcar en festivos
--
-- No usar como excepcion de festivos:
--   employee_shift_overrides
--   justifications

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'ABORTADO: falta public.profiles';
  end if;

  if to_regclass('public.companies') is null then
    raise exception 'ABORTADO: falta public.companies';
  end if;

  if to_regclass('public.departments') is null then
    raise exception 'ABORTADO: falta public.departments';
  end if;

  if to_regclass('public.work_centers') is null then
    raise exception 'ABORTADO: falta public.work_centers';
  end if;

  if to_regclass('public.access_profiles') is null then
    raise exception 'ABORTADO: falta public.access_profiles';
  end if;

  if to_regclass('public.holiday_work_authorizations') is null then
    raise exception 'ABORTADO: falta public.holiday_work_authorizations';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'my_profile_id'
      and p.prokind = 'f'
  ) then
    raise exception 'ABORTADO: falta public.my_profile_id()';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'has_any_role'
      and p.prokind = 'f'
  ) then
    raise exception 'ABORTADO: falta public.has_any_role(...)';
  end if;
end $$;

create table if not exists public.management_scopes (
  id uuid primary key default gen_random_uuid(),
  responsible_profile_id uuid not null references public.profiles(id) on delete cascade,
  scope_type text not null check (scope_type in ('company','department','work_center','profile')),
  company_id uuid null references public.companies(id) on delete cascade,
  department_id uuid null references public.departments(id) on delete cascade,
  work_center_id uuid null references public.work_centers(id) on delete cascade,
  target_profile_id uuid null references public.profiles(id) on delete cascade,
  active boolean not null default true,
  valid_from date not null default current_date,
  valid_until date null,
  created_by uuid null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,

  constraint management_scopes_valid_dates
    check (valid_until is null or valid_until >= valid_from),

  constraint management_scopes_scope_target_check
    check (
      (
        scope_type = 'company'
        and company_id is not null
        and department_id is null
        and work_center_id is null
        and target_profile_id is null
      )
      or (
        scope_type = 'department'
        and department_id is not null
        and company_id is null
        and work_center_id is null
        and target_profile_id is null
      )
      or (
        scope_type = 'work_center'
        and work_center_id is not null
        and company_id is null
        and department_id is null
        and target_profile_id is null
      )
      or (
        scope_type = 'profile'
        and target_profile_id is not null
        and company_id is null
        and department_id is null
        and work_center_id is null
      )
    )
);

comment on table public.management_scopes is
'Alcance canonico de jefaturas/gerentes/coordinadores. Define sobre que empresa, departamento, centro o trabajador puede gestionar un responsable.';

comment on column public.management_scopes.responsible_profile_id is
'Perfil de la jefatura, gerente, coordinador o responsable que recibe alcance.';

comment on column public.management_scopes.scope_type is
'Tipo de alcance: company, department, work_center o profile.';

create index if not exists idx_management_scopes_responsible
  on public.management_scopes(responsible_profile_id)
  where active is true;

create index if not exists idx_management_scopes_company
  on public.management_scopes(company_id)
  where active is true and scope_type = 'company';

create index if not exists idx_management_scopes_department
  on public.management_scopes(department_id)
  where active is true and scope_type = 'department';

create index if not exists idx_management_scopes_work_center
  on public.management_scopes(work_center_id)
  where active is true and scope_type = 'work_center';

create index if not exists idx_management_scopes_target_profile
  on public.management_scopes(target_profile_id)
  where active is true and scope_type = 'profile';

create unique index if not exists uq_management_scopes_active_company
  on public.management_scopes(responsible_profile_id, company_id)
  where active is true and scope_type = 'company';

create unique index if not exists uq_management_scopes_active_department
  on public.management_scopes(responsible_profile_id, department_id)
  where active is true and scope_type = 'department';

create unique index if not exists uq_management_scopes_active_work_center
  on public.management_scopes(responsible_profile_id, work_center_id)
  where active is true and scope_type = 'work_center';

create unique index if not exists uq_management_scopes_active_profile
  on public.management_scopes(responsible_profile_id, target_profile_id)
  where active is true and scope_type = 'profile';

create or replace function public.set_management_scopes_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists trg_management_scopes_updated_at
  on public.management_scopes;

create trigger trg_management_scopes_updated_at
before update on public.management_scopes
for each row
execute function public.set_management_scopes_updated_at();

alter table public.management_scopes enable row level security;

drop policy if exists management_scopes_read_own_or_admin_rrhh
  on public.management_scopes;

drop policy if exists management_scopes_write_admin_rrhh
  on public.management_scopes;

create policy management_scopes_read_own_or_admin_rrhh
on public.management_scopes
for select
to authenticated
using (
  responsible_profile_id = public.my_profile_id()
  or public.has_any_role(array['admin'::public.app_role, 'rrhh'::public.app_role])
);

create policy management_scopes_write_admin_rrhh
on public.management_scopes
for all
to authenticated
using (
  public.has_any_role(array['admin'::public.app_role, 'rrhh'::public.app_role])
)
with check (
  public.has_any_role(array['admin'::public.app_role, 'rrhh'::public.app_role])
);

create or replace function public.current_user_has_module_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce((
    select
      case
        when public.has_any_role(array['admin'::public.app_role]) then true
        else coalesce((ap.module_permissions ->> p_permission)::boolean, false)
      end
    from public.profiles p
    left join public.access_profiles ap on ap.id = p.access_profile_id
    where p.user_id = auth.uid()
      and coalesce(p.active, true) is true
    limit 1
  ), false);
$fn$;

revoke all on function public.current_user_has_module_permission(text) from public;
revoke all on function public.current_user_has_module_permission(text) from anon;
grant execute on function public.current_user_has_module_permission(text) to authenticated;

create or replace function public.profile_can_manage_profile(
  p_responsible_profile_id uuid,
  p_target_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(exists (
    select 1
    from public.management_scopes ms
    join public.profiles target on target.id = p_target_profile_id
    where ms.responsible_profile_id = p_responsible_profile_id
      and ms.active is true
      and current_date >= ms.valid_from
      and (ms.valid_until is null or current_date <= ms.valid_until)
      and coalesce(target.active, true) is true
      and (
        (ms.scope_type = 'company' and target.company_id = ms.company_id)
        or (ms.scope_type = 'department' and target.department_id = ms.department_id)
        or (ms.scope_type = 'work_center' and target.work_center_id = ms.work_center_id)
        or (ms.scope_type = 'profile' and target.id = ms.target_profile_id)
      )
  ), false);
$fn$;

revoke all on function public.profile_can_manage_profile(uuid, uuid) from public;
revoke all on function public.profile_can_manage_profile(uuid, uuid) from anon;
grant execute on function public.profile_can_manage_profile(uuid, uuid) to authenticated;

create or replace function public.can_manage_holiday_work_authorization(
  p_target_profile_id uuid,
  p_action text default 'manage'
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_me uuid := public.my_profile_id();
  v_action text := lower(coalesce(p_action, 'manage'));
begin
  if v_me is null or p_target_profile_id is null then
    return false;
  end if;

  -- Admin/RRHH conservan potestad global de supervision paralela.
  -- El flujo funcional principal debe ser jefaturas/gerencias con permiso + alcance.
  if public.has_any_role(array['admin'::public.app_role, 'rrhh'::public.app_role]) then
    return true;
  end if;

  if public.current_user_has_module_permission('holiday_authorizations.manage_all') then
    return true;
  end if;

  if v_action in ('view','audit') and public.current_user_has_module_permission('holiday_authorizations.audit') then
    return true;
  end if;

  if v_action = 'view'
     and public.current_user_has_module_permission('holiday_authorizations.view')
     and public.profile_can_manage_profile(v_me, p_target_profile_id) then
    return true;
  end if;

  if public.current_user_has_module_permission('holiday_authorizations.manage_team')
     and public.profile_can_manage_profile(v_me, p_target_profile_id) then
    return true;
  end if;

  return false;
end;
$fn$;

revoke all on function public.can_manage_holiday_work_authorization(uuid, text) from public;
revoke all on function public.can_manage_holiday_work_authorization(uuid, text) from anon;
grant execute on function public.can_manage_holiday_work_authorization(uuid, text) to authenticated;

drop policy if exists holiday_work_authorizations_read_self_or_admin
  on public.holiday_work_authorizations;

drop policy if exists holiday_work_authorizations_write_admin_rrhh
  on public.holiday_work_authorizations;

drop policy if exists holiday_work_authorizations_read_self_or_scope
  on public.holiday_work_authorizations;

drop policy if exists holiday_work_authorizations_write_scope
  on public.holiday_work_authorizations;

create policy holiday_work_authorizations_read_self_or_scope
on public.holiday_work_authorizations
for select
to authenticated
using (
  profile_id = public.my_profile_id()
  or public.can_manage_holiday_work_authorization(profile_id, 'view')
);

create policy holiday_work_authorizations_write_scope
on public.holiday_work_authorizations
for all
to authenticated
using (
  public.can_manage_holiday_work_authorization(profile_id, 'manage')
)
with check (
  public.can_manage_holiday_work_authorization(profile_id, 'manage')
);

comment on function public.profile_can_manage_profile(uuid, uuid) is
'FASE 1.6: devuelve true si un responsable tiene alcance activo sobre un trabajador mediante public.management_scopes.';

comment on function public.can_manage_holiday_work_authorization(uuid, text) is
'FASE 1.6: permiso canonico para ver/gestionar autorizaciones de trabajo en festivos segun permisos funcionales + management_scopes. Admin/RRHH conservan supervision paralela.';

do $$
declare
  v_management_scopes_policies integer;
  v_holiday_scope_policies integer;
begin
  if to_regclass('public.management_scopes') is null then
    raise exception 'ERROR_POST_PATCH: no existe public.management_scopes';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'current_user_has_module_permission'
      and p.prokind = 'f'
  ) then
    raise exception 'ERROR_POST_PATCH: falta current_user_has_module_permission';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'profile_can_manage_profile'
      and p.prokind = 'f'
  ) then
    raise exception 'ERROR_POST_PATCH: falta profile_can_manage_profile';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'can_manage_holiday_work_authorization'
      and p.prokind = 'f'
  ) then
    raise exception 'ERROR_POST_PATCH: falta can_manage_holiday_work_authorization';
  end if;

  select count(*)
  into v_management_scopes_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = 'management_scopes';

  if v_management_scopes_policies < 2 then
    raise exception 'ERROR_POST_PATCH: management_scopes tiene menos de 2 policies';
  end if;

  select count(*)
  into v_holiday_scope_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = 'holiday_work_authorizations'
    and policyname in (
      'holiday_work_authorizations_read_self_or_scope',
      'holiday_work_authorizations_write_scope'
    );

  if v_holiday_scope_policies <> 2 then
    raise exception 'ERROR_POST_PATCH: no estan las 2 policies canonicas de holiday_work_authorizations';
  end if;
end $$;

commit;
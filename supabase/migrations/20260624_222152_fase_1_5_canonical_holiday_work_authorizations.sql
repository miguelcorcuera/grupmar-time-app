-- FASE 1.5F - Canonical holiday work authorizations
-- Canonical path:
--   public.holiday_work_authorizations
--   public.profile_has_holiday_work_authorization(...)
--
-- Business rule:
--   If day is holiday, can_profile_mark_now blocks unless there is an
--   approved + active authorization for profile_id + work_date.
--
-- Important:
--   Do not use employee_shift_overrides or justifications as the canonical
--   holiday exception path.

begin;

create table if not exists public.holiday_work_authorizations (
  id uuid primary key default gen_random_uuid(),

  profile_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,

  holiday_id uuid null references public.company_holidays(id) on delete set null,

  status text not null default 'approved'
    check (status in ('pending','approved','rejected','revoked')),

  active boolean not null default true,

  reason text null,
  notes text null,

  authorized_start_time time without time zone null,
  authorized_end_time time without time zone null,

  created_by uuid null default auth.uid(),
  approved_by uuid null,
  approved_at timestamp with time zone null,

  revoked_by uuid null,
  revoked_at timestamp with time zone null,

  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  metadata jsonb not null default '{}'::jsonb,

  constraint holiday_work_authorizations_time_check
    check (
      authorized_start_time is null
      or authorized_end_time is null
      or authorized_start_time < authorized_end_time
    )
);

comment on table public.holiday_work_authorizations is
'CANONICAL: autorizaciones oficiales para permitir marcaciones en dias festivos por perfil y fecha. No usar employee_shift_overrides ni justifications como sustituto de este flujo.';

comment on column public.holiday_work_authorizations.profile_id is
'Perfil autorizado a trabajar/marcar en el festivo.';

comment on column public.holiday_work_authorizations.work_date is
'Fecha concreta del festivo autorizado.';

comment on column public.holiday_work_authorizations.holiday_id is
'Referencia opcional al festivo de company_holidays.';

comment on column public.holiday_work_authorizations.status is
'Estado canonico de autorizacion: pending, approved, rejected, revoked. Solo approved + active permite saltar bloqueo de festivo.';

comment on column public.holiday_work_authorizations.active is
'Debe ser true para que la autorizacion sea considerada valida.';

comment on column public.holiday_work_authorizations.authorized_start_time is
'Ventana opcional de inicio autorizada. Si es null, se usa el horario normal del turno.';

comment on column public.holiday_work_authorizations.authorized_end_time is
'Ventana opcional de fin autorizada. Si es null, se usa el horario normal del turno.';

create index if not exists idx_holiday_work_authorizations_profile_date
  on public.holiday_work_authorizations(profile_id, work_date);

create index if not exists idx_holiday_work_authorizations_work_date
  on public.holiday_work_authorizations(work_date);

create index if not exists idx_holiday_work_authorizations_holiday
  on public.holiday_work_authorizations(holiday_id);

create unique index if not exists uq_holiday_work_authorizations_one_active_approved_per_day
  on public.holiday_work_authorizations(profile_id, work_date)
  where active is true and status = 'approved';

create or replace function public.set_holiday_work_authorizations_updated_at()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists trg_holiday_work_authorizations_updated_at
  on public.holiday_work_authorizations;

create trigger trg_holiday_work_authorizations_updated_at
before update on public.holiday_work_authorizations
for each row
execute function public.set_holiday_work_authorizations_updated_at();

alter table public.holiday_work_authorizations enable row level security;

drop policy if exists holiday_work_authorizations_read_self_or_admin
  on public.holiday_work_authorizations;

create policy holiday_work_authorizations_read_self_or_admin
on public.holiday_work_authorizations
for select
to authenticated
using (
  profile_id = public.my_profile_id()
  or public.has_any_role(array[
    'admin'::public.app_role,
    'rrhh'::public.app_role,
    'manager'::public.app_role
  ])
);

drop policy if exists holiday_work_authorizations_write_admin_rrhh
  on public.holiday_work_authorizations;

create policy holiday_work_authorizations_write_admin_rrhh
on public.holiday_work_authorizations
for all
to authenticated
using (
  public.has_any_role(array[
    'admin'::public.app_role,
    'rrhh'::public.app_role
  ])
)
with check (
  public.has_any_role(array[
    'admin'::public.app_role,
    'rrhh'::public.app_role
  ])
);

create or replace function public.profile_has_holiday_work_authorization(
  p_profile_id uuid,
  p_work_date date
)
returns table(
  authorized boolean,
  authorization_id uuid,
  reason text,
  authorized_start_time time without time zone,
  authorized_end_time time without time zone
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with candidate as (
    select
      hwa.id,
      hwa.reason,
      hwa.authorized_start_time,
      hwa.authorized_end_time
    from public.holiday_work_authorizations hwa
    where hwa.profile_id = p_profile_id
      and hwa.work_date = p_work_date
      and hwa.active is true
      and hwa.status = 'approved'
      and (
        p_profile_id = public.my_profile_id()
        or public.has_any_role(array[
          'admin'::public.app_role,
          'rrhh'::public.app_role,
          'manager'::public.app_role
        ])
      )
    order by hwa.approved_at desc nulls last, hwa.created_at desc
    limit 1
  )
  select
    (candidate.id is not null) as authorized,
    candidate.id as authorization_id,
    coalesce(candidate.reason, 'Autorizacion aprobada para trabajar en festivo.')::text as reason,
    candidate.authorized_start_time,
    candidate.authorized_end_time
  from candidate

  union all

  select
    false as authorized,
    null::uuid as authorization_id,
    null::text as reason,
    null::time as authorized_start_time,
    null::time as authorized_end_time
  where not exists (select 1 from candidate)

  limit 1;
$function$;

revoke all on function public.profile_has_holiday_work_authorization(uuid, date) from public;
revoke all on function public.profile_has_holiday_work_authorization(uuid, date) from anon;
grant execute on function public.profile_has_holiday_work_authorization(uuid, date) to authenticated;

create or replace function public.can_profile_mark_now_backup_fase_1_5d_20260624(
  p_profile_id uuid,
  p_at timestamp with time zone default now()
)
returns table(
  allowed boolean,
  reason text,
  assigned_schedule text,
  shift_start time without time zone,
  shift_end time without time zone,
  assignment_id uuid
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  s record;
  h record;
  local_date date;
  local_time time;
  local_year int;
  local_month int;
  local_day int;
  start_allowed time;
  end_allowed time;
begin
  local_date := (p_at at time zone 'Europe/Madrid')::date;
  local_time := (p_at at time zone 'Europe/Madrid')::time;
  local_year := extract(year from local_date)::int;
  local_month := extract(month from local_date)::int;
  local_day := extract(day from local_date)::int;

  select *
  into s
  from public.get_active_shift_for_profile(p_profile_id, local_date)
  limit 1;

  if s.assignment_id is null then
    return query
    select
      false,
      'No tienes turno asignado para hoy.'::text,
      'Sin turno asignado'::text,
      null::time,
      null::time,
      null::uuid;
    return;
  end if;

  select ch.*
  into h
  from public.company_holidays ch
  where ch.active is true
    and ch.month = local_month
    and ch.day = local_day
    and coalesce(ch.type, 'festivo') = 'festivo'
    and (
      not (ch.metadata ? 'year')
      or nullif(ch.metadata->>'year', '') is null
      or (
        (ch.metadata->>'year') ~ '^[0-9]{4}$'
        and (ch.metadata->>'year')::int = local_year
      )
    )
  order by
    case lower(coalesce(ch.scope, ''))
      when 'local' then 1
      when 'autonomico' then 2
      when 'nacional' then 3
      when 'estatal' then 4
      else 9
    end,
    ch.name nulls last,
    ch.title nulls last
  limit 1;

  if h.id is not null then
    return query
    select
      false,
      (
        'Hoy es festivo'
        || case
          when coalesce(h.name, h.title) is not null
          then ': ' || coalesce(h.name, h.title)
          else ''
        end
        || '. No puedes registrar marcaciones salvo autorizacion expresa de administracion.'
      )::text,
      (
        'Festivo'
        || case
          when coalesce(h.name, h.title) is not null
          then ': ' || coalesce(h.name, h.title)
          else ''
        end
      )::text,
      s.start_time,
      s.end_time,
      s.assignment_id;
    return;
  end if;

  start_allowed := s.start_time - make_interval(mins => coalesce(s.early_entry_minutes, 0));
  end_allowed := s.end_time + make_interval(mins => coalesce(s.exit_grace_minutes, 0));

  if local_time < start_allowed or local_time > end_allowed then
    return query
    select
      false,
      (
        'No puedes marcar aun tus marcaciones. Te invitamos a hacerlo en el horario de '
        || to_char(s.start_time, 'HH24:MI')
        || ' a '
        || to_char(s.end_time, 'HH24:MI')
        || '.'
      )::text,
      (to_char(s.start_time, 'HH24:MI') || ' - ' || to_char(s.end_time, 'HH24:MI'))::text,
      s.start_time,
      s.end_time,
      s.assignment_id;
    return;
  end if;

  return query
  select
    true,
    'Marcacion permitida.'::text,
    (to_char(s.start_time, 'HH24:MI') || ' - ' || to_char(s.end_time, 'HH24:MI'))::text,
    s.start_time,
    s.end_time,
    s.assignment_id;
end;
$function$;

revoke all on function public.can_profile_mark_now_backup_fase_1_5d_20260624(uuid, timestamp with time zone) from public;
revoke all on function public.can_profile_mark_now_backup_fase_1_5d_20260624(uuid, timestamp with time zone) from anon;
revoke all on function public.can_profile_mark_now_backup_fase_1_5d_20260624(uuid, timestamp with time zone) from authenticated;

create or replace function public.can_profile_mark_now(
  p_profile_id uuid,
  p_at timestamp with time zone default now()
)
returns table(
  allowed boolean,
  reason text,
  assigned_schedule text,
  shift_start time without time zone,
  shift_end time without time zone,
  assignment_id uuid
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  s record;
  h record;
  a record;
  local_date date;
  local_time time;
  local_year int;
  local_month int;
  local_day int;
  start_allowed time;
  end_allowed time;
  is_holiday_authorized boolean := false;
begin
  local_date := (p_at at time zone 'Europe/Madrid')::date;
  local_time := (p_at at time zone 'Europe/Madrid')::time;
  local_year := extract(year from local_date)::int;
  local_month := extract(month from local_date)::int;
  local_day := extract(day from local_date)::int;

  select *
  into s
  from public.get_active_shift_for_profile(p_profile_id, local_date)
  limit 1;

  if s.assignment_id is null then
    return query
    select
      false,
      'No tienes turno asignado para hoy.'::text,
      'Sin turno asignado'::text,
      null::time,
      null::time,
      null::uuid;
    return;
  end if;

  select ch.*
  into h
  from public.company_holidays ch
  where ch.active is true
    and ch.month = local_month
    and ch.day = local_day
    and coalesce(ch.type, 'festivo') = 'festivo'
    and (
      not (ch.metadata ? 'year')
      or nullif(ch.metadata->>'year', '') is null
      or (
        (ch.metadata->>'year') ~ '^[0-9]{4}$'
        and (ch.metadata->>'year')::int = local_year
      )
    )
  order by
    case lower(coalesce(ch.scope, ''))
      when 'local' then 1
      when 'autonomico' then 2
      when 'nacional' then 3
      when 'estatal' then 4
      else 9
    end,
    ch.name nulls last,
    ch.title nulls last
  limit 1;

  if h.id is not null then
    select *
    into a
    from public.profile_has_holiday_work_authorization(p_profile_id, local_date)
    limit 1;

    is_holiday_authorized := coalesce(a.authorized, false);

    if not is_holiday_authorized then
      return query
      select
        false,
        (
          'Hoy es festivo'
          || case
            when coalesce(h.name, h.title) is not null
            then ': ' || coalesce(h.name, h.title)
            else ''
          end
          || '. No puedes registrar marcaciones salvo autorizacion expresa de administracion.'
        )::text,
        (
          'Festivo'
          || case
            when coalesce(h.name, h.title) is not null
            then ': ' || coalesce(h.name, h.title)
            else ''
          end
        )::text,
        s.start_time,
        s.end_time,
        s.assignment_id;
      return;
    end if;
  end if;

  start_allowed := s.start_time - make_interval(mins => coalesce(s.early_entry_minutes, 0));
  end_allowed := s.end_time + make_interval(mins => coalesce(s.exit_grace_minutes, 0));

  if local_time < start_allowed or local_time > end_allowed then
    return query
    select
      false,
      (
        'No puedes marcar aun tus marcaciones. Te invitamos a hacerlo en el horario de '
        || to_char(s.start_time, 'HH24:MI')
        || ' a '
        || to_char(s.end_time, 'HH24:MI')
        || '.'
      )::text,
      (
        to_char(s.start_time, 'HH24:MI')
        || ' - '
        || to_char(s.end_time, 'HH24:MI')
        || case
          when h.id is not null and is_holiday_authorized
          then ' · Festivo autorizado'
          else ''
        end
      )::text,
      s.start_time,
      s.end_time,
      s.assignment_id;
    return;
  end if;

  return query
  select
    true,
    case
      when h.id is not null and is_holiday_authorized
      then 'Marcacion permitida con autorizacion de festivo.'::text
      else 'Marcacion permitida.'::text
    end,
    (
      to_char(s.start_time, 'HH24:MI')
      || ' - '
      || to_char(s.end_time, 'HH24:MI')
      || case
        when h.id is not null and is_holiday_authorized
        then ' · Festivo autorizado'
        else ''
      end
    )::text,
    s.start_time,
    s.end_time,
    s.assignment_id;
end;
$function$;

comment on function public.can_profile_mark_now(uuid, timestamp with time zone) is
'CANONICAL FASE 1.5D: valida marcacion. Si el dia es festivo, solo permite continuar si existe autorizacion aprobada en public.holiday_work_authorizations mediante public.profile_has_holiday_work_authorization.';

commit;
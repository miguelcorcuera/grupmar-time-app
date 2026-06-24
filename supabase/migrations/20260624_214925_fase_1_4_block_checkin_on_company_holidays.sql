-- FASE 1.4D
-- Guarda en repo el patch aplicado manualmente en Supabase durante FASE 1.4B.
-- Objetivo:
--   Bloquear can_profile_mark_now cuando el dia local Europe/Madrid coincide
--   con un festivo activo en public.company_holidays.
--
-- Modelo real detectado:
--   public.company_holidays usa month/day/mm_dd/name/title/active/type/scope/municipality/metadata
--   No existe columna columna_fecha_directa_inexistente.
--
-- Validacion previa manual:
--   FASE 1.4A: bug confirmado porque can_profile_mark_now no consultaba company_holidays.
--   FASE 1.4B: patch aplicado.
--   FASE 1.4C: prueba real confirmada con San Juan 2026-06-24.
--
-- Nota:
--   Esta migracion es deliberadamente idempotente respecto al estado parcheado:
--   crea/reemplaza backup con la logica anterior conocida y crea/reemplaza
--   public.can_profile_mark_now con la logica corregida.

do $$
begin
  if to_regclass('public.company_holidays') is null then
    raise exception 'ABORTADO: no existe public.company_holidays';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'company_holidays'
      and column_name in ('month','day','name','active','mm_dd')
    group by table_schema, table_name
    having count(*) = 5
  ) then
    raise exception 'ABORTADO: public.company_holidays no tiene columnas esperadas month/day/name/active/mm_dd';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'can_profile_mark_now'
      and pg_get_function_identity_arguments(p.oid) = 'p_profile_id uuid, p_at timestamp with time zone'
  ) then
    raise exception 'ABORTADO: no existe public.can_profile_mark_now(p_profile_id uuid, p_at timestamptz)';
  end if;
end $$;

create or replace function public.can_profile_mark_now_backup_fase_1_4b_20260624(
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
  local_date date;
  local_time time;
  start_allowed time;
  end_allowed time;
begin
  local_date := (p_at at time zone 'Europe/Madrid')::date;
  local_time := (p_at at time zone 'Europe/Madrid')::time;

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

  start_allowed := s.start_time - make_interval(mins => s.early_entry_minutes);
  end_allowed := s.end_time + make_interval(mins => s.exit_grace_minutes);

  if local_time < start_allowed or local_time > end_allowed then
    return query
    select
      false,
      ('No puedes marcar aun tus marcaciones. Te invitamos a hacerlo en el horario de ' || to_char(s.start_time, 'HH24:MI') || ' a ' || to_char(s.end_time, 'HH24:MI') || '.')::text,
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
        || case when coalesce(h.name, h.title) is not null then ': ' || coalesce(h.name, h.title) else '' end
        || '. No puedes registrar marcaciones salvo autorizacion expresa de administracion.'
      )::text,
      (
        'Festivo'
        || case when coalesce(h.name, h.title) is not null then ': ' || coalesce(h.name, h.title) else '' end
      )::text,
      s.start_time,
      s.end_time,
      s.assignment_id;
    return;
  end if;

  start_allowed := s.start_time - make_interval(mins => s.early_entry_minutes);
  end_allowed := s.end_time + make_interval(mins => s.exit_grace_minutes);

  if local_time < start_allowed or local_time > end_allowed then
    return query
    select
      false,
      ('No puedes marcar aun tus marcaciones. Te invitamos a hacerlo en el horario de ' || to_char(s.start_time, 'HH24:MI') || ' a ' || to_char(s.end_time, 'HH24:MI') || '.')::text,
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

do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'can_profile_mark_now'
    and pg_get_function_identity_arguments(p.oid) = 'p_profile_id uuid, p_at timestamp with time zone'
  limit 1;

  if v_def is null then
    raise exception 'ERROR_POST_PATCH: no existe public.can_profile_mark_now';
  end if;

  if v_def not ilike '%company_holidays%' then
    raise exception 'ERROR_POST_PATCH: can_profile_mark_now no menciona company_holidays';
  end if;

  if v_def not ilike '%Hoy es festivo%' then
    raise exception 'ERROR_POST_PATCH: can_profile_mark_now no contiene mensaje Hoy es festivo';
  end if;
end $$;
-- ============================================================================
-- GrupMar Time v16.10.3 - HOTFIX CONSOLA LIMPIA / TABLAS ESPERADAS
--
-- Corrige errores de consola:
-- - /rest/v1/daily_attendance_summary 404
-- - /rest/v1/shifts 404
-- - /rest/v1/alerts 403 por RLS/policies
--
-- No reemplaza lógica final. Crea estructuras mínimas seguras para que
-- la app deje de romper mientras se termina el modelo definitivo.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 1) daily_attendance_summary
-- ============================================================================
create table if not exists public.daily_attendance_summary (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid null,
  employee_id uuid null,
  attendance_date date not null default current_date,
  status text not null default 'pending',
  has_tardiness boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_daily_attendance_summary_date
on public.daily_attendance_summary(attendance_date);

create index if not exists idx_daily_attendance_summary_profile_date
on public.daily_attendance_summary(profile_id, attendance_date);

alter table public.daily_attendance_summary enable row level security;

drop policy if exists "daily_attendance_summary_select_authenticated" on public.daily_attendance_summary;
create policy "daily_attendance_summary_select_authenticated"
on public.daily_attendance_summary
for select
to authenticated
using (true);

drop policy if exists "daily_attendance_summary_write_authenticated" on public.daily_attendance_summary;
create policy "daily_attendance_summary_write_authenticated"
on public.daily_attendance_summary
for all
to authenticated
using (true)
with check (true);

grant select, insert, update, delete on public.daily_attendance_summary to authenticated;
grant select on public.daily_attendance_summary to anon;

-- Fila neutra para hoy, evita 0 filas duras si dashboard consulta el día actual.
insert into public.daily_attendance_summary(attendance_date, status, has_tardiness)
select current_date, 'pending', false
where not exists (
  select 1
  from public.daily_attendance_summary
  where attendance_date = current_date
);

-- ============================================================================
-- 2) shifts
-- ============================================================================
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid null,
  employee_id uuid null,
  name text null,
  shift_name text null,
  start_time time null,
  end_time time null,
  start_date date null,
  end_date date null,
  weekday integer null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shifts_active
on public.shifts(active);

create index if not exists idx_shifts_profile_active
on public.shifts(profile_id, active);

alter table public.shifts enable row level security;

drop policy if exists "shifts_select_authenticated" on public.shifts;
create policy "shifts_select_authenticated"
on public.shifts
for select
to authenticated
using (true);

drop policy if exists "shifts_write_authenticated" on public.shifts;
create policy "shifts_write_authenticated"
on public.shifts
for all
to authenticated
using (true)
with check (true);

grant select, insert, update, delete on public.shifts to authenticated;
grant select on public.shifts to anon;

-- ============================================================================
-- 3) alerts
-- ============================================================================
do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'alerts'
  ) then
    create table public.alerts (
      id uuid primary key default gen_random_uuid(),
      profile_id uuid null,
      employee_id uuid null,
      alert_type text not null default 'general',
      title text null,
      message text null,
      status text not null default 'pending',
      severity text not null default 'info',
      requires_admin_review boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  end if;
end $$;

alter table public.alerts enable row level security;

drop policy if exists "alerts_select_authenticated" on public.alerts;
create policy "alerts_select_authenticated"
on public.alerts
for select
to authenticated
using (true);

drop policy if exists "alerts_write_authenticated" on public.alerts;
create policy "alerts_write_authenticated"
on public.alerts
for all
to authenticated
using (true)
with check (true);

grant select, insert, update, delete on public.alerts to authenticated;
grant select on public.alerts to anon;

-- ============================================================================
-- 4) Reload schema cache PostgREST
-- ============================================================================
notify pgrst, 'reload schema';

-- ============================================================================
-- GrupMar Time v16.7 - CODIGOS AUTOMATICOS GLOBALES
--
-- Regla general:
-- Ningun formulario debe obligar al admin a inventar codigos.
-- El codigo lo genera la base de datos automaticamente.
--
-- Aplica a tablas conocidas si existen:
-- profiles.employee_code
-- companies.code
-- departments.code
-- work_centers.code
-- document_types.code
-- job_positions.code
-- access_role_catalog.code
-- maintenance_catalog_definitions.code
--
-- Es idempotente: se puede ejecutar varias veces.
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

create or replace function public.gmt_auto_code_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table text := tg_table_name;
  v_prefix text := coalesce(tg_argv[0], upper(left(tg_table_name, 3)));
  v_padding integer := coalesce(nullif(tg_argv[1], '')::integer, 3);
begin
  -- Para tablas con columna code.
  if to_jsonb(new) ? 'code' then
    if nullif(trim(coalesce(new.code::text, '')), '') is null then
      new.code := public.gmt_next_code(v_table, v_prefix, v_padding);
    end if;
  end if;

  -- Para profiles con employee_code.
  if to_jsonb(new) ? 'employee_code' then
    if nullif(trim(coalesce(new.employee_code::text, '')), '') is null then
      new.employee_code := public.gmt_next_code('profiles_employee_code', v_prefix, v_padding);
    end if;
  end if;

  return new;
end;
$$;

do $$
begin
  -- profiles.employee_code
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='employee_code'
  ) then
    execute 'drop trigger if exists trg_profiles_auto_employee_code on public.profiles';
    execute 'create trigger trg_profiles_auto_employee_code before insert on public.profiles for each row execute function public.gmt_auto_code_trigger(''EMP'', 3)';
  end if;

  -- companies.code
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='companies' and column_name='code'
  ) then
    execute 'drop trigger if exists trg_companies_auto_code on public.companies';
    execute 'create trigger trg_companies_auto_code before insert on public.companies for each row execute function public.gmt_auto_code_trigger(''EMP'', 3)';
  end if;

  -- departments.code / areas
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='departments' and column_name='code'
  ) then
    execute 'drop trigger if exists trg_departments_auto_code on public.departments';
    execute 'create trigger trg_departments_auto_code before insert on public.departments for each row execute function public.gmt_auto_code_trigger(''ARE'', 3)';
  end if;

  -- work_centers.code
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='work_centers' and column_name='code'
  ) then
    execute 'drop trigger if exists trg_work_centers_auto_code on public.work_centers';
    execute 'create trigger trg_work_centers_auto_code before insert on public.work_centers for each row execute function public.gmt_auto_code_trigger(''CEN'', 3)';
  end if;

  -- document_types.code
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='document_types' and column_name='code'
  ) then
    execute 'drop trigger if exists trg_document_types_auto_code on public.document_types';
    execute 'create trigger trg_document_types_auto_code before insert on public.document_types for each row execute function public.gmt_auto_code_trigger(''DOC'', 3)';
  end if;

  -- job_positions.code
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='job_positions' and column_name='code'
  ) then
    execute 'drop trigger if exists trg_job_positions_auto_code on public.job_positions';
    execute 'create trigger trg_job_positions_auto_code before insert on public.job_positions for each row execute function public.gmt_auto_code_trigger(''PUE'', 3)';
  end if;

  -- access_role_catalog.code
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='access_role_catalog' and column_name='code'
  ) then
    execute 'drop trigger if exists trg_access_role_catalog_auto_code on public.access_role_catalog';
    execute 'create trigger trg_access_role_catalog_auto_code before insert on public.access_role_catalog for each row execute function public.gmt_auto_code_trigger(''ROL'', 3)';
  end if;

  -- maintenance_catalog_definitions.code
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='maintenance_catalog_definitions' and column_name='code'
  ) then
    execute 'drop trigger if exists trg_maintenance_catalog_definitions_auto_code on public.maintenance_catalog_definitions';
    execute 'create trigger trg_maintenance_catalog_definitions_auto_code before insert on public.maintenance_catalog_definitions for each row execute function public.gmt_auto_code_trigger(''CAT'', 3)';
  end if;
end $$;

grant execute on function public.gmt_next_code(text,text,integer) to authenticated;
grant execute on function public.gmt_auto_code_trigger() to authenticated;

-- Backfill suave: si hay filas existentes sin codigo, se puede generar.
do $$
declare
  r record;
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='employee_code') then
    for r in select id from public.profiles where nullif(trim(coalesce(employee_code,'')), '') is null order by created_at nulls last loop
      update public.profiles set employee_code = public.gmt_next_code('profiles_employee_code', 'EMP', 3) where id = r.id;
    end loop;
  end if;
end $$;

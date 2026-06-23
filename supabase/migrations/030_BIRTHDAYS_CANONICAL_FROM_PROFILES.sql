-- ============================================================================
-- GrupMar Time v16.19.4 - Cumpleaños canónicos desde public.profiles
--
-- Regla:
-- - Cumpleaños NO se guarda en localStorage.
-- - Cumpleaños NO se guarda en tablas de celebraciones.
-- - Cumpleaños se calcula desde public.profiles.birth_date.
-- ============================================================================

drop function if exists public.gmt_birthdays_today(date);

create function public.gmt_birthdays_today(p_ref_date date default current_date)
returns table (
  profile_id uuid,
  full_name text,
  email text,
  birth_date date,
  mm_dd text,
  department text,
  work_center text,
  company_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as profile_id,
    p.full_name,
    p.email,
    p.birth_date,
    to_char(p.birth_date, 'MM-DD') as mm_dd,
    p.department,
    p.work_center,
    p.company_name
  from public.profiles p
  where p.active is true
    and p.birth_date is not null
    and to_char(p.birth_date, 'MM-DD') = to_char(p_ref_date, 'MM-DD')
  order by p.full_name nulls last, p.email nulls last;
$$;

grant execute on function public.gmt_birthdays_today(date) to authenticated;

drop function if exists public.gmt_birthdays_upcoming(integer, date);

create function public.gmt_birthdays_upcoming(
  p_days integer default 30,
  p_ref_date date default current_date
)
returns table (
  profile_id uuid,
  full_name text,
  email text,
  birth_date date,
  mm_dd text,
  department text,
  work_center text,
  company_name text,
  days_until integer
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      p_ref_date::date as ref_date,
      greatest(0, least(coalesce(p_days, 30), 366))::integer as days
  ),
  people as (
    select
      p.id,
      p.full_name,
      p.email,
      p.birth_date,
      p.department,
      p.work_center,
      p.company_name,
      make_date(
        extract(year from params.ref_date)::integer,
        extract(month from p.birth_date)::integer,
        extract(day from p.birth_date)::integer
      ) as birthday_this_year,
      params.ref_date,
      params.days
    from public.profiles p
    cross join params
    where p.active is true
      and p.birth_date is not null
  ),
  normalized as (
    select
      *,
      case
        when birthday_this_year < ref_date then birthday_this_year + interval '1 year'
        else birthday_this_year
      end::date as next_birthday
    from people
  )
  select
    id as profile_id,
    full_name,
    email,
    birth_date,
    to_char(birth_date, 'MM-DD') as mm_dd,
    department,
    work_center,
    company_name,
    (next_birthday - ref_date)::integer as days_until
  from normalized
  where (next_birthday - ref_date)::integer between 0 and days
  order by days_until, full_name nulls last, email nulls last;
$$;

grant execute on function public.gmt_birthdays_upcoming(integer, date) to authenticated;

-- Verificación hoy.
select *
from public.gmt_birthdays_today(current_date);


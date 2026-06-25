begin;

-- FASE 1.8D + 1.8E FIX1
-- Canonical employee requests model.
-- Safe writes by RPC only.
-- No direct INSERT/UPDATE/DELETE policies for authenticated frontend.
-- Holiday work approvals create/update holiday_work_authorizations.
-- Important fix: ON CONFLICT predicate must match partial unique index:
--   where active is true and status = 'approved'::text

create table if not exists public.employee_requests (
  id uuid primary key default gen_random_uuid(),
  request_code text unique,
  request_type text not null,
  status text not null default 'submitted',

  profile_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid null,
  department_id uuid null,
  work_center_id uuid null,

  date_from date null,
  date_to date null,
  work_date date null,
  start_time time null,
  end_time time null,
  all_day boolean not null default false,

  title text null,
  reason text null,
  employee_notes text null,
  manager_notes text null,
  rrhh_notes text null,

  reviewed_by uuid null references public.profiles(id) on delete set null,
  reviewed_at timestamptz null,
  applied_by uuid null references public.profiles(id) on delete set null,
  applied_at timestamptz null,
  cancelled_by uuid null references public.profiles(id) on delete set null,
  cancelled_at timestamptz null,

  linked_holiday_authorization_id uuid null references public.holiday_work_authorizations(id) on delete set null,
  related_attendance_event_id uuid null references public.attendance_events(id) on delete set null,
  related_shift_plan_id uuid null references public.employee_shift_plans(id) on delete set null,

  created_by uuid null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,

  constraint employee_requests_request_type_check check (
    request_type = any (array[
      'holiday_work',
      'vacation',
      'personal_permission',
      'overtime',
      'shift_change',
      'schedule_change',
      'early_leave',
      'late_arrival',
      'absence',
      'other'
    ])
  ),
  constraint employee_requests_status_check check (
    status = any (array[
      'draft',
      'submitted',
      'under_review',
      'needs_info',
      'approved',
      'rejected',
      'postponed',
      'cancelled',
      'applied',
      'closed'
    ])
  ),
  constraint employee_requests_holiday_work_requires_work_date_check check (
    request_type <> 'holiday_work' or work_date is not null
  ),
  constraint employee_requests_vacation_requires_date_range_check check (
    request_type <> 'vacation' or (date_from is not null and date_to is not null)
  ),
  constraint employee_requests_date_range_check check (
    date_from is null or date_to is null or date_to >= date_from
  ),
  constraint employee_requests_time_range_check check (
    start_time is null or end_time is null or end_time > start_time
  )
);

create table if not exists public.employee_request_actions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.employee_requests(id) on delete cascade,
  actor_profile_id uuid null references public.profiles(id) on delete set null,
  actor_user_id uuid null default auth.uid(),
  action_type text not null,
  from_status text null,
  to_status text null,
  note text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint employee_request_actions_action_type_check check (
    action_type = any (array[
      'created',
      'submitted',
      'review_started',
      'approved',
      'rejected',
      'postponed',
      'needs_info',
      'cancelled',
      'applied',
      'closed',
      'reopened',
      'commented'
    ])
  )
);

create index if not exists idx_employee_requests_profile_id
  on public.employee_requests(profile_id);

create index if not exists idx_employee_requests_status
  on public.employee_requests(status);

create index if not exists idx_employee_requests_request_type
  on public.employee_requests(request_type);

create index if not exists idx_employee_requests_work_date
  on public.employee_requests(work_date);

create index if not exists idx_employee_requests_created_at
  on public.employee_requests(created_at desc);

create index if not exists idx_employee_request_actions_request_id
  on public.employee_request_actions(request_id);

create index if not exists idx_employee_request_actions_actor_profile_id
  on public.employee_request_actions(actor_profile_id);

create index if not exists idx_employee_request_actions_created_at
  on public.employee_request_actions(created_at desc);

alter table public.employee_requests enable row level security;
alter table public.employee_request_actions enable row level security;

revoke insert, update, delete on public.employee_requests from anon, authenticated;
revoke insert, update, delete on public.employee_request_actions from anon, authenticated;

grant select on public.employee_requests to authenticated;
grant select on public.employee_request_actions to authenticated;

create or replace function public.can_manage_employee_request_for_profile(
  p_target_profile_id uuid,
  p_action text default 'view'
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_me uuid;
  v_is_admin_rrhh boolean := false;
  v_perm boolean := false;
  v_scope boolean := false;
begin
  v_me := public.my_profile_id();

  if v_me is null or p_target_profile_id is null then
    return false;
  end if;

  if p_action = 'view' and v_me = p_target_profile_id then
    return true;
  end if;

  if to_regprocedure('public.has_any_role(text[])') is not null then
    execute 'select public.has_any_role($1::text[])'
      into v_is_admin_rrhh
      using array['admin','rrhh'];
  end if;

  if coalesce(v_is_admin_rrhh, false) then
    return true;
  end if;

  if to_regprocedure('public.current_user_has_module_permission(text)') is not null then
    if p_action = 'view' then
      execute 'select public.current_user_has_module_permission($1)'
        into v_perm
        using 'staff_requests.view_all';

      if coalesce(v_perm, false) then return true; end if;

      execute 'select public.current_user_has_module_permission($1)'
        into v_perm
        using 'staff_requests.manage_all';

      if coalesce(v_perm, false) then return true; end if;

      execute 'select public.current_user_has_module_permission($1)'
        into v_perm
        using 'employee_requests.audit';

      if coalesce(v_perm, false) then return true; end if;
    else
      execute 'select public.current_user_has_module_permission($1)'
        into v_perm
        using 'staff_requests.manage_all';

      if coalesce(v_perm, false) then return true; end if;
    end if;

    if p_action = 'view' then
      execute 'select public.current_user_has_module_permission($1)'
        into v_perm
        using 'staff_requests.view_team';

      if not coalesce(v_perm, false) then
        execute 'select public.current_user_has_module_permission($1)'
          into v_perm
          using 'staff_requests.manage_team';
      end if;
    else
      execute 'select public.current_user_has_module_permission($1)'
        into v_perm
        using 'staff_requests.manage_team';
    end if;
  end if;

  if not coalesce(v_perm, false) then
    return false;
  end if;

  if to_regprocedure('public.profile_can_manage_profile(uuid,uuid)') is not null then
    execute 'select public.profile_can_manage_profile($1,$2)'
      into v_scope
      using v_me, p_target_profile_id;
  end if;

  return coalesce(v_scope, false);
end;
$fn$;

create or replace function public.can_manage_employee_request(
  p_request_id uuid,
  p_action text default 'view'
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_target_profile_id uuid;
begin
  select er.profile_id
    into v_target_profile_id
  from public.employee_requests er
  where er.id = p_request_id;

  if v_target_profile_id is null then
    return false;
  end if;

  return public.can_manage_employee_request_for_profile(v_target_profile_id, p_action);
end;
$fn$;

drop policy if exists employee_requests_read_own_or_scope on public.employee_requests;
create policy employee_requests_read_own_or_scope
on public.employee_requests
for select
to authenticated
using (
  profile_id = public.my_profile_id()
  or public.can_manage_employee_request_for_profile(profile_id, 'view')
);

drop policy if exists employee_request_actions_read_own_or_scope on public.employee_request_actions;
create policy employee_request_actions_read_own_or_scope
on public.employee_request_actions
for select
to authenticated
using (
  exists (
    select 1
    from public.employee_requests er
    where er.id = employee_request_actions.request_id
      and (
        er.profile_id = public.my_profile_id()
        or public.can_manage_employee_request_for_profile(er.profile_id, 'view')
      )
  )
);

create or replace function public.gmt_employee_requests_visible()
returns setof public.employee_requests
language sql
security definer
set search_path = public, extensions
as $fn$
  select er.*
  from public.employee_requests er
  where er.profile_id = public.my_profile_id()
     or public.can_manage_employee_request_for_profile(er.profile_id, 'view')
  order by er.created_at desc;
$fn$;

create or replace function public.gmt_create_employee_request(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_me uuid;
  v_target_profile_id uuid;
  v_request_type text;
  v_status text;
  v_request_id uuid;
  v_request_code text;
  v_work_date date;
  v_date_from date;
  v_date_to date;
  v_start_time time;
  v_end_time time;
begin
  v_me := public.my_profile_id();

  if v_me is null then
    raise exception 'No authenticated profile found';
  end if;

  v_target_profile_id := coalesce(nullif(p_payload ->> 'profile_id', '')::uuid, v_me);
  v_request_type := nullif(p_payload ->> 'request_type', '');
  v_status := coalesce(nullif(p_payload ->> 'status', ''), 'submitted');

  if v_request_type is null then
    raise exception 'request_type is required';
  end if;

  if v_request_type <> any (array[
    'holiday_work',
    'vacation',
    'personal_permission',
    'overtime',
    'shift_change',
    'schedule_change',
    'early_leave',
    'late_arrival',
    'absence',
    'other'
  ]) then
    raise exception 'Invalid request_type: %', v_request_type;
  end if;

  if v_status <> any (array['draft','submitted']) then
    raise exception 'Invalid initial status: %', v_status;
  end if;

  if v_target_profile_id <> v_me
     and not public.can_manage_employee_request_for_profile(v_target_profile_id, 'manage') then
    raise exception 'Not allowed to create request for selected profile';
  end if;

  v_work_date := nullif(p_payload ->> 'work_date', '')::date;
  v_date_from := nullif(p_payload ->> 'date_from', '')::date;
  v_date_to := nullif(p_payload ->> 'date_to', '')::date;
  v_start_time := nullif(p_payload ->> 'start_time', '')::time;
  v_end_time := nullif(p_payload ->> 'end_time', '')::time;

  if v_request_type = 'holiday_work' and v_work_date is null then
    raise exception 'holiday_work requires work_date';
  end if;

  if v_request_type = 'vacation' and (v_date_from is null or v_date_to is null) then
    raise exception 'vacation requires date_from and date_to';
  end if;

  if v_date_from is not null and v_date_to is not null and v_date_to < v_date_from then
    raise exception 'date_to cannot be before date_from';
  end if;

  if v_start_time is not null and v_end_time is not null and v_end_time <= v_start_time then
    raise exception 'end_time must be greater than start_time';
  end if;

  v_request_code := 'REQ-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || substr(gen_random_uuid()::text, 1, 8);

  insert into public.employee_requests (
    request_code,
    request_type,
    status,
    profile_id,
    company_id,
    department_id,
    work_center_id,
    date_from,
    date_to,
    work_date,
    start_time,
    end_time,
    all_day,
    title,
    reason,
    employee_notes,
    created_by,
    metadata
  )
  values (
    v_request_code,
    v_request_type,
    v_status,
    v_target_profile_id,
    nullif(p_payload ->> 'company_id', '')::uuid,
    nullif(p_payload ->> 'department_id', '')::uuid,
    nullif(p_payload ->> 'work_center_id', '')::uuid,
    v_date_from,
    v_date_to,
    v_work_date,
    v_start_time,
    v_end_time,
    coalesce((p_payload ->> 'all_day')::boolean, false),
    nullif(p_payload ->> 'title', ''),
    nullif(p_payload ->> 'reason', ''),
    nullif(p_payload ->> 'employee_notes', ''),
    auth.uid(),
    coalesce(p_payload -> 'metadata', '{}'::jsonb)
  )
  returning id into v_request_id;

  insert into public.employee_request_actions (
    request_id,
    actor_profile_id,
    actor_user_id,
    action_type,
    from_status,
    to_status,
    note,
    metadata
  )
  values (
    v_request_id,
    v_me,
    auth.uid(),
    case when v_status = 'draft' then 'created' else 'submitted' end,
    null,
    v_status,
    nullif(p_payload ->> 'employee_notes', ''),
    jsonb_build_object('source', 'gmt_create_employee_request')
  );

  return v_request_id;
end;
$fn$;

create or replace function public.gmt_review_employee_request(
  p_request_id uuid,
  p_decision text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_me uuid;
  v_request public.employee_requests%rowtype;
  v_old_status text;
  v_holiday_id uuid;
  v_holiday_auth_id uuid;
begin
  v_me := public.my_profile_id();

  if v_me is null then
    raise exception 'No authenticated profile found';
  end if;

  select *
    into v_request
  from public.employee_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'employee_request not found: %', p_request_id;
  end if;

  if v_request.status = any (array['applied','closed','cancelled']) then
    raise exception 'Request cannot be reviewed from status: %', v_request.status;
  end if;

  if p_decision <> any (array['approved','rejected','postponed','needs_info','under_review']) then
    raise exception 'Invalid review decision: %', p_decision;
  end if;

  if p_decision = any (array['approved','rejected','postponed','needs_info'])
     and length(trim(coalesce(p_note, ''))) < 5 then
    raise exception 'Review note is required';
  end if;

  if not public.can_manage_employee_request_for_profile(v_request.profile_id, 'manage') then
    raise exception 'Not allowed to review this request';
  end if;

  v_old_status := v_request.status;

  update public.employee_requests
  set status = p_decision,
      manager_notes = p_note,
      reviewed_by = v_me,
      reviewed_at = now(),
      updated_at = now()
  where id = p_request_id;

  insert into public.employee_request_actions (
    request_id,
    actor_profile_id,
    actor_user_id,
    action_type,
    from_status,
    to_status,
    note,
    metadata
  )
  values (
    p_request_id,
    v_me,
    auth.uid(),
    case
      when p_decision = 'under_review' then 'review_started'
      else p_decision
    end,
    v_old_status,
    p_decision,
    p_note,
    jsonb_build_object('source', 'gmt_review_employee_request')
  );

  if v_request.request_type = 'holiday_work' and p_decision = 'approved' then
    select ch.id
      into v_holiday_id
    from public.company_holidays ch
    where ch.active is true
      and ch.mm_dd = to_char(v_request.work_date, 'MM-DD')
    order by ch.created_at nulls last
    limit 1;

    insert into public.holiday_work_authorizations (
      profile_id,
      work_date,
      holiday_id,
      status,
      active,
      reason,
      notes,
      authorized_start_time,
      authorized_end_time,
      created_by,
      approved_by,
      approved_at,
      metadata
    )
    values (
      v_request.profile_id,
      v_request.work_date,
      v_holiday_id,
      'approved',
      true,
      coalesce(v_request.reason, v_request.title),
      p_note,
      v_request.start_time,
      v_request.end_time,
      auth.uid(),
      v_me,
      now(),
      jsonb_build_object('employee_request_id', p_request_id, 'source', 'employee_requests')
    )
    on conflict (profile_id, work_date)
    where active is true and status = 'approved'::text
    do update set
      holiday_id = excluded.holiday_id,
      status = 'approved',
      active = true,
      reason = excluded.reason,
      notes = excluded.notes,
      authorized_start_time = excluded.authorized_start_time,
      authorized_end_time = excluded.authorized_end_time,
      approved_by = excluded.approved_by,
      approved_at = now(),
      metadata = coalesce(public.holiday_work_authorizations.metadata, '{}'::jsonb)
        || jsonb_build_object('employee_request_id', p_request_id, 'source', 'employee_requests'),
      updated_at = now()
    returning id into v_holiday_auth_id;

    update public.employee_requests
    set linked_holiday_authorization_id = v_holiday_auth_id,
        updated_at = now()
    where id = p_request_id;
  end if;

  return p_request_id;
end;
$fn$;

create or replace function public.gmt_apply_employee_request(
  p_request_id uuid,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_me uuid;
  v_request public.employee_requests%rowtype;
  v_can_apply boolean := false;
  v_is_admin_rrhh boolean := false;
begin
  v_me := public.my_profile_id();

  if v_me is null then
    raise exception 'No authenticated profile found';
  end if;

  select *
    into v_request
  from public.employee_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'employee_request not found: %', p_request_id;
  end if;

  if v_request.status <> any (array['approved','postponed']) then
    raise exception 'Only approved or postponed requests can be applied. Current status: %', v_request.status;
  end if;

  if length(trim(coalesce(p_note, ''))) < 5 then
    raise exception 'Apply note is required';
  end if;

  if to_regprocedure('public.has_any_role(text[])') is not null then
    execute 'select public.has_any_role($1::text[])'
      into v_is_admin_rrhh
      using array['admin','rrhh'];
  end if;

  if coalesce(v_is_admin_rrhh, false) then
    v_can_apply := true;
  elsif to_regprocedure('public.current_user_has_module_permission(text)') is not null then
    execute 'select public.current_user_has_module_permission($1)'
      into v_can_apply
      using 'labor_requests.apply';
  end if;

  if not coalesce(v_can_apply, false) then
    raise exception 'Not allowed to apply employee request';
  end if;

  update public.employee_requests
  set status = 'applied',
      rrhh_notes = p_note,
      applied_by = v_me,
      applied_at = now(),
      updated_at = now()
  where id = p_request_id;

  insert into public.employee_request_actions (
    request_id,
    actor_profile_id,
    actor_user_id,
    action_type,
    from_status,
    to_status,
    note,
    metadata
  )
  values (
    p_request_id,
    v_me,
    auth.uid(),
    'applied',
    v_request.status,
    'applied',
    p_note,
    jsonb_build_object('source', 'gmt_apply_employee_request')
  );

  return p_request_id;
end;
$fn$;

create or replace function public.gmt_cancel_employee_request(
  p_request_id uuid,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_me uuid;
  v_request public.employee_requests%rowtype;
begin
  v_me := public.my_profile_id();

  if v_me is null then
    raise exception 'No authenticated profile found';
  end if;

  select *
    into v_request
  from public.employee_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'employee_request not found: %', p_request_id;
  end if;

  if v_request.status = any (array['applied','closed','cancelled']) then
    raise exception 'Request cannot be cancelled from status: %', v_request.status;
  end if;

  if v_request.profile_id <> v_me
     and not public.can_manage_employee_request_for_profile(v_request.profile_id, 'manage') then
    raise exception 'Not allowed to cancel this request';
  end if;

  if length(trim(coalesce(p_note, ''))) < 5 then
    raise exception 'Cancel note is required';
  end if;

  update public.employee_requests
  set status = 'cancelled',
      cancelled_by = v_me,
      cancelled_at = now(),
      manager_notes = case
        when v_request.profile_id <> v_me then p_note
        else manager_notes
      end,
      employee_notes = case
        when v_request.profile_id = v_me then coalesce(employee_notes, '') || E'\nCancelacion: ' || p_note
        else employee_notes
      end,
      updated_at = now()
  where id = p_request_id;

  insert into public.employee_request_actions (
    request_id,
    actor_profile_id,
    actor_user_id,
    action_type,
    from_status,
    to_status,
    note,
    metadata
  )
  values (
    p_request_id,
    v_me,
    auth.uid(),
    'cancelled',
    v_request.status,
    'cancelled',
    p_note,
    jsonb_build_object('source', 'gmt_cancel_employee_request')
  );

  return p_request_id;
end;
$fn$;

grant execute on function public.can_manage_employee_request_for_profile(uuid,text) to authenticated;
grant execute on function public.can_manage_employee_request(uuid,text) to authenticated;
grant execute on function public.gmt_employee_requests_visible() to authenticated;
grant execute on function public.gmt_create_employee_request(jsonb) to authenticated;
grant execute on function public.gmt_review_employee_request(uuid,text,text) to authenticated;
grant execute on function public.gmt_apply_employee_request(uuid,text) to authenticated;
grant execute on function public.gmt_cancel_employee_request(uuid,text) to authenticated;

commit;
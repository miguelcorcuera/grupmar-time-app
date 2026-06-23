-- ============================================================================
-- GrupMar Time v16.18.2.1 - RPC canónica para Turnos / Horarios configurados
--
-- Tabla real usada:
-- public.shift_templates
-- ============================================================================

create or replace function public.admin_shift_template_save(
  p_id uuid,
  p_payload jsonb
)
returns public.shift_templates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := nullif(trim(coalesce(p_payload->>'name','')), '');
  v_description text := coalesce(p_payload->>'description','');
  v_start_time time := nullif(p_payload->>'start_time','')::time;
  v_end_time time := nullif(p_payload->>'end_time','')::time;
  v_lunch_start time := nullif(p_payload->>'lunch_start','')::time;
  v_lunch_end time := nullif(p_payload->>'lunch_end','')::time;
  v_lunch_minutes integer := nullif(p_payload->>'lunch_minutes','')::integer;
  v_entry_tolerance_minutes integer := coalesce(nullif(p_payload->>'entry_tolerance_minutes','')::integer, 10);
  v_exit_grace_minutes integer := coalesce(nullif(p_payload->>'exit_grace_minutes','')::integer, 5);
  v_early_entry_minutes integer := coalesce(nullif(p_payload->>'early_entry_minutes','')::integer, 0);
  v_weekly_hours numeric := nullif(p_payload->>'weekly_hours','')::numeric;
  v_color text := coalesce(nullif(trim(coalesce(p_payload->>'color','')), ''), '#2563eb');
  v_active boolean := coalesce(nullif(p_payload->>'active','')::boolean, true);
  v_company_id uuid := nullif(p_payload->>'company_id','')::uuid;
  v_row public.shift_templates;
begin
  if v_name is null then
    raise exception 'El nombre del turno es obligatorio';
  end if;

  if v_start_time is null or v_end_time is null then
    raise exception 'Hora de inicio y fin son obligatorias';
  end if;

  if v_lunch_minutes is null and v_lunch_start is not null and v_lunch_end is not null then
    v_lunch_minutes := greatest(0, extract(epoch from (v_lunch_end - v_lunch_start)) / 60)::integer;
  end if;

  if p_id is null then
    insert into public.shift_templates(
      company_id,
      name,
      description,
      start_time,
      end_time,
      lunch_start,
      lunch_end,
      lunch_minutes,
      entry_tolerance_minutes,
      exit_grace_minutes,
      early_entry_minutes,
      weekly_hours,
      color,
      active
    )
    values (
      v_company_id,
      v_name,
      v_description,
      v_start_time,
      v_end_time,
      v_lunch_start,
      v_lunch_end,
      coalesce(v_lunch_minutes, 0),
      v_entry_tolerance_minutes,
      v_exit_grace_minutes,
      v_early_entry_minutes,
      v_weekly_hours,
      v_color,
      v_active
    )
    returning * into v_row;
  else
    update public.shift_templates
    set
      company_id = v_company_id,
      name = v_name,
      description = v_description,
      start_time = v_start_time,
      end_time = v_end_time,
      lunch_start = v_lunch_start,
      lunch_end = v_lunch_end,
      lunch_minutes = coalesce(v_lunch_minutes, lunch_minutes),
      entry_tolerance_minutes = v_entry_tolerance_minutes,
      exit_grace_minutes = v_exit_grace_minutes,
      early_entry_minutes = v_early_entry_minutes,
      weekly_hours = v_weekly_hours,
      color = v_color,
      active = v_active,
      updated_at = now()
    where id = p_id
    returning * into v_row;

    if v_row.id is null then
      raise exception 'No existe turno con id %', p_id;
    end if;
  end if;

  return v_row;
end;
$$;

grant execute on function public.admin_shift_template_save(uuid, jsonb) to authenticated;


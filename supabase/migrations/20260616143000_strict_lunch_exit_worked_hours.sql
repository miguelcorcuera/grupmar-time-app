-- Corrección estricta: entrada fija, almuerzo por franja, salida anticipada con alerta y horas trabajadas.

ALTER TABLE public.shifts ALTER COLUMN allow_lunch_outside_window SET DEFAULT false;
UPDATE public.shifts SET allow_lunch_outside_window = false;

ALTER TABLE public.daily_attendance_summary ADD COLUMN IF NOT EXISTS worked_minutes_gross integer NOT NULL DEFAULT 0;
ALTER TABLE public.daily_attendance_summary ADD COLUMN IF NOT EXISTS worked_minutes_net integer NOT NULL DEFAULT 0;
ALTER TABLE public.daily_attendance_summary ADD COLUMN IF NOT EXISTS early_exit boolean NOT NULL DEFAULT false;
ALTER TABLE public.daily_attendance_summary ADD COLUMN IF NOT EXISTS early_exit_minutes integer NOT NULL DEFAULT 0;
ALTER TABLE public.daily_attendance_summary ADD COLUMN IF NOT EXISTS lunch_missed boolean NOT NULL DEFAULT false;
ALTER TABLE public.daily_attendance_summary ADD COLUMN IF NOT EXISTS lunch_requires_regularization boolean NOT NULL DEFAULT false;

ALTER TABLE public.attendance_events ADD COLUMN IF NOT EXISTS early_exit boolean NOT NULL DEFAULT false;
ALTER TABLE public.attendance_events ADD COLUMN IF NOT EXISTS early_exit_minutes integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.register_attendance_event(
  p_event_type text,
  p_notes text DEFAULT NULL,
  client_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_browser text DEFAULT NULL,
  p_device text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_event_id uuid;
  v_today date := current_date;
  v_now timestamptz := now();
  v_shift record;
  v_allowed_ip text;
  v_is_company boolean;
  v_loc text;
  v_allow_outside boolean;
  v_has_open_lunch boolean;
  v_has_open_perm boolean;
  v_has_open_extra boolean;
  v_has_entry boolean;
  v_start_ts timestamptz;
  v_end_ts timestamptz;
  v_deadline timestamptz;
  v_lunch_start_ts timestamptz;
  v_lunch_end_ts timestamptz;
  v_lunch_start_event timestamptz;
  v_lunch_minutes integer := 0;
  v_lunch_deviation integer := 0;
  v_requires_review boolean := false;
  v_status text := 'valid';
  v_lunch_status text := 'not_applicable';
  v_message text;
  v_early_exit_minutes integer := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','no_session'); END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;
  IF v_profile.id IS NULL OR v_profile.active = false THEN RETURN jsonb_build_object('error','profile_inactive'); END IF;
  IF p_event_type NOT IN ('LUNCH_START','LUNCH_END','PERMISSION_START','PERMISSION_END','EXTRA_EXIT_START','EXTRA_EXIT_END','EXIT') THEN
    RETURN jsonb_build_object('error','invalid_event_type');
  END IF;

  v_allowed_ip := public.get_setting('allowed_company_ip');
  v_allow_outside := COALESCE(public.get_setting('allow_outside_company_clocking')='true', true);
  v_is_company := (client_ip IS NOT NULL AND client_ip = v_allowed_ip);
  v_loc := CASE WHEN client_ip IS NULL OR client_ip = '' THEN 'unknown' WHEN v_is_company THEN 'company_network' ELSE 'outside_company_network' END;

  IF v_loc <> 'company_network' AND v_allow_outside = false THEN
    INSERT INTO public.security_logs(employee_id, event_type, ip_address, user_agent, browser_info, device_info, is_company_network, connection_location_status, risk_level, message)
    VALUES (v_uid, 'blocked_'||p_event_type, client_ip, p_user_agent, p_browser, p_device, false, 'blocked', 'high', 'Intento bloqueado por IP no autorizada.');
    RETURN jsonb_build_object('blocked', true, 'message','No se puede registrar la marcación porque no está conectado desde la red autorizada de la empresa.');
  END IF;

  SELECT * INTO v_shift FROM public.get_active_shift_for_employee(v_uid, v_today);
  IF v_shift.shift_id IS NULL THEN RETURN jsonb_build_object('blocked', true, 'message','No tiene turno asignado para hoy.'); END IF;

  v_start_ts := v_today + v_shift.start_time;
  v_end_ts := v_today + v_shift.end_time;
  IF v_shift.end_time < v_shift.start_time THEN v_end_ts := v_end_ts + interval '1 day'; END IF;
  v_deadline := v_end_ts + make_interval(mins => COALESCE(v_shift.exit_grace_minutes,5));
  v_lunch_start_ts := v_today + v_shift.lunch_start_time;
  v_lunch_end_ts := v_today + v_shift.lunch_end_time;

  SELECT EXISTS(SELECT 1 FROM public.attendance_events WHERE employee_id=v_uid AND event_date=v_today AND event_type='ENTRY') INTO v_has_entry;
  IF NOT v_has_entry THEN RETURN jsonb_build_object('error','no_entry_today', 'message','Debe registrar primero la entrada del día.'); END IF;

  IF COALESCE(v_shift.block_clocking_after_shift_close,true) AND v_now > v_deadline THEN
    INSERT INTO public.attendance_attempts(employee_id, attempted_event_type, attempted_at, scheduled_time, deadline_time, reason, ip_address, user_agent, connection_location_status, status)
    VALUES (v_uid, p_event_type, v_now, CASE WHEN p_event_type='EXIT' THEN v_shift.end_time ELSE NULL END, v_deadline, CASE WHEN p_event_type='EXIT' THEN 'late_exit_blocked' ELSE 'shift_closed' END, client_ip, p_user_agent, v_loc, 'blocked');
    INSERT INTO public.alerts(employee_id, alert_type, severity, title, message)
    VALUES (v_uid, CASE WHEN p_event_type='EXIT' THEN 'late_exit_blocked' ELSE 'shift_closed' END, 'warning', 'Marcación bloqueada por cierre de jornada', format('El trabajador %s intentó registrar %s después del cierre de jornada. Límite: %s. Hora intentada: %s.', v_profile.full_name, p_event_type, to_char(v_deadline,'HH24:MI'), to_char(v_now,'HH24:MI')));
    RETURN jsonb_build_object('blocked', true, 'closed', true, 'message', format('Su jornada terminó a las %s y el margen máximo para registrar salida era hasta las %s. El sistema ya se encuentra cerrado. Contacte con su supervisor para regularizar la incidencia.', to_char(v_shift.end_time,'HH24:MI'), to_char(v_deadline,'HH24:MI')));
  END IF;

  v_has_open_lunch := EXISTS(SELECT 1 FROM public.attendance_events e WHERE e.employee_id=v_uid AND e.event_date=v_today AND e.event_type='LUNCH_START' AND NOT EXISTS (SELECT 1 FROM public.attendance_events e2 WHERE e2.employee_id=v_uid AND e2.event_date=v_today AND e2.event_type='LUNCH_END' AND e2.event_time > e.event_time));
  v_has_open_perm := EXISTS(SELECT 1 FROM public.attendance_events e WHERE e.employee_id=v_uid AND e.event_date=v_today AND e.event_type='PERMISSION_START' AND NOT EXISTS (SELECT 1 FROM public.attendance_events e2 WHERE e2.employee_id=v_uid AND e2.event_date=v_today AND e2.event_type='PERMISSION_END' AND e2.event_time > e.event_time));
  v_has_open_extra := EXISTS(SELECT 1 FROM public.attendance_events e WHERE e.employee_id=v_uid AND e.event_date=v_today AND e.event_type='EXTRA_EXIT_START' AND NOT EXISTS (SELECT 1 FROM public.attendance_events e2 WHERE e2.employee_id=v_uid AND e2.event_date=v_today AND e2.event_type='EXTRA_EXIT_END' AND e2.event_time > e.event_time));

  IF p_event_type='LUNCH_START' AND v_has_open_lunch THEN RETURN jsonb_build_object('error','lunch_already_open', 'message','Ya existe un almuerzo abierto.'); END IF;
  IF p_event_type='LUNCH_END' AND NOT v_has_open_lunch THEN RETURN jsonb_build_object('error','no_open_lunch', 'message','No existe un almuerzo abierto para finalizar.'); END IF;
  IF p_event_type='PERMISSION_END' AND NOT v_has_open_perm THEN RETURN jsonb_build_object('error','no_open_permission'); END IF;
  IF p_event_type='EXTRA_EXIT_END' AND NOT v_has_open_extra THEN RETURN jsonb_build_object('error','no_open_extra_exit'); END IF;
  IF p_event_type='PERMISSION_START' AND v_has_open_perm THEN RETURN jsonb_build_object('error','permission_already_open'); END IF;
  IF p_event_type='EXTRA_EXIT_START' AND v_has_open_extra THEN RETURN jsonb_build_object('error','extra_exit_already_open'); END IF;
  IF p_event_type='EXIT' AND (v_has_open_lunch OR v_has_open_perm OR v_has_open_extra) THEN RETURN jsonb_build_object('error','open_event_blocks_exit', 'message','No puede registrar salida final con almuerzo, permiso o salida extraordinaria abierta.'); END IF;
  IF p_event_type='EXIT' AND EXISTS(SELECT 1 FROM public.attendance_events WHERE employee_id=v_uid AND event_date=v_today AND event_type='EXIT') THEN RETURN jsonb_build_object('error','exit_already_registered', 'message','La salida final ya fue registrada.'); END IF;

  IF p_event_type='LUNCH_START' THEN
    IF v_now < v_lunch_start_ts THEN
      v_lunch_deviation := GREATEST(0, EXTRACT(EPOCH FROM (v_lunch_start_ts - v_now))::int / 60);
      INSERT INTO public.attendance_attempts(employee_id, attempted_event_type, attempted_at, scheduled_time, deadline_time, reason, ip_address, user_agent, connection_location_status, status)
      VALUES (v_uid, 'LUNCH_START', v_now, v_shift.lunch_start_time, v_lunch_start_ts, 'lunch_started_too_early', client_ip, p_user_agent, v_loc, 'blocked');
      INSERT INTO public.alerts(employee_id, alert_type, severity, title, message)
      VALUES (v_uid, 'lunch_started_too_early', 'warning', 'Almuerzo anticipado bloqueado', format('El trabajador %s intentó iniciar almuerzo antes de su horario. Permitido: %s - %s. Hora intentada: %s.', v_profile.full_name, to_char(v_shift.lunch_start_time,'HH24:MI'), to_char(v_shift.lunch_end_time,'HH24:MI'), to_char(v_now,'HH24:MI')));
      RETURN jsonb_build_object('blocked', true, 'message', format('Su horario de almuerzo inicia a las %s. No puede iniciar almuerzo antes del horario asignado.', to_char(v_shift.lunch_start_time,'HH24:MI')));
    ELSIF v_now > v_lunch_end_ts THEN
      v_lunch_deviation := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_lunch_end_ts))::int / 60);
      INSERT INTO public.attendance_attempts(employee_id, attempted_event_type, attempted_at, scheduled_time, deadline_time, reason, ip_address, user_agent, connection_location_status, status)
      VALUES (v_uid, 'LUNCH_START', v_now, v_shift.lunch_start_time, v_lunch_end_ts, 'lunch_started_late', client_ip, p_user_agent, v_loc, 'blocked');
      INSERT INTO public.alerts(employee_id, alert_type, severity, title, message)
      VALUES (v_uid, 'lunch_started_late', 'warning', 'Almuerzo vencido no registrado', format('El trabajador %s no registró almuerzo dentro de la franja asignada. Permitido: %s - %s. Intento: %s. Desviación: %s minutos. Debe regularizar con supervisor.', v_profile.full_name, to_char(v_shift.lunch_start_time,'HH24:MI'), to_char(v_shift.lunch_end_time,'HH24:MI'), to_char(v_now,'HH24:MI'), v_lunch_deviation));
      INSERT INTO public.daily_attendance_summary(employee_id, attendance_date, shift_id, expected_entry_time, expected_exit_time, expected_lunch_start_time, expected_lunch_end_time, shift_close_deadline, status, close_status, lunch_late, lunch_late_minutes, lunch_missed, lunch_requires_regularization, lunch_status, requires_admin_review)
      VALUES (v_uid, v_today, v_shift.shift_id, v_shift.start_time, v_shift.end_time, v_shift.lunch_start_time, v_shift.lunch_end_time, v_deadline, 'pending_review', 'open', true, v_lunch_deviation, true, true, 'pending_review', true)
      ON CONFLICT (employee_id, attendance_date) DO UPDATE SET
        lunch_late=true, lunch_late_minutes=GREATEST(public.daily_attendance_summary.lunch_late_minutes, EXCLUDED.lunch_late_minutes),
        lunch_missed=true, lunch_requires_regularization=true, lunch_status='pending_review', requires_admin_review=true, status='pending_review', updated_at=now();
      RETURN jsonb_build_object('blocked', true, 'message', format('Su horario de almuerzo era de %s a %s. Ya venció. Debe regularizarlo con su supervisor.', to_char(v_shift.lunch_start_time,'HH24:MI'), to_char(v_shift.lunch_end_time,'HH24:MI')));
    ELSE
      v_lunch_status := 'inside_window';
      v_message := 'Inicio de almuerzo registrado.';
    END IF;
  END IF;

  IF p_event_type='LUNCH_END' THEN
    SELECT event_time INTO v_lunch_start_event FROM public.attendance_events WHERE employee_id=v_uid AND event_date=v_today AND event_type='LUNCH_START' ORDER BY event_time DESC LIMIT 1;
    v_lunch_minutes := COALESCE(EXTRACT(EPOCH FROM (v_now - v_lunch_start_event))::int / 60,0);
    IF v_lunch_minutes > COALESCE(v_shift.max_lunch_minutes,60) THEN
      v_requires_review := true;
      v_status := 'pending_review';
      v_lunch_status := 'overrun';
      v_lunch_deviation := v_lunch_minutes - COALESCE(v_shift.max_lunch_minutes,60);
      INSERT INTO public.alerts(employee_id, alert_type, severity, title, message)
      VALUES (v_uid, 'lunch_overrun', 'warning', 'Exceso de almuerzo', format('El trabajador %s superó el tiempo máximo de almuerzo. Permitido: %s minutos. Exceso: %s minutos.', v_profile.full_name, v_shift.max_lunch_minutes, v_lunch_deviation));
      v_message := 'Ha superado el tiempo máximo de almuerzo permitido. Esta incidencia será notificada a su supervisor.';
    ELSE
      v_lunch_status := 'inside_window';
      v_message := 'Fin de almuerzo registrado.';
    END IF;
  END IF;

  IF p_event_type='EXIT' AND v_now < v_end_ts THEN
    v_requires_review := true;
    v_status := 'pending_review';
    v_early_exit_minutes := GREATEST(0, EXTRACT(EPOCH FROM (v_end_ts - v_now))::int / 60);
    INSERT INTO public.alerts(employee_id, alert_type, severity, title, message)
    VALUES (v_uid, 'early_exit', 'warning', 'Salida anticipada', format('El trabajador %s registró salida antes del fin del turno. Fin esperado: %s. Salida: %s. Diferencia: %s minutos.', v_profile.full_name, to_char(v_shift.end_time,'HH24:MI'), to_char(v_now,'HH24:MI'), v_early_exit_minutes));
    v_message := format('Salida final registrada antes del horario. Faltaban %s minutos para terminar el turno. Esta incidencia será notificada al administrador.', v_early_exit_minutes);
  END IF;

  INSERT INTO public.attendance_events(employee_id, event_type, event_time, event_date, source, ip_address, user_agent, browser_info, device_info, connection_location_status, is_company_network, security_flag, notes, created_by, status, requires_admin_review, is_lunch_event, lunch_window_status, lunch_deviation_minutes, early_exit, early_exit_minutes)
  VALUES (v_uid, p_event_type, v_now, v_today, 'web', client_ip, p_user_agent, p_browser, p_device, v_loc, v_is_company, NOT v_is_company OR v_requires_review, p_notes, v_uid, v_status, v_requires_review, p_event_type IN ('LUNCH_START','LUNCH_END'), v_lunch_status, v_lunch_deviation, p_event_type='EXIT' AND v_early_exit_minutes > 0, v_early_exit_minutes)
  RETURNING id INTO v_event_id;

  RETURN jsonb_build_object('event_id', v_event_id, 'event_type', p_event_type, 'event_time', v_now, 'connection_location_status', v_loc, 'is_company_network', v_is_company, 'requires_admin_review', v_requires_review, 'message', COALESCE(v_message, 'Marcación registrada'));
END $$;

CREATE OR REPLACE FUNCTION public.fn_attendance_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_assign public.employee_shift_assignments;
  v_shift public.shifts;
  v_late integer := 0;
  v_late_after integer := 0;
  v_lunch_minutes integer := 0;
  v_deadline timestamptz;
  v_gross integer := 0;
  v_net integer := 0;
BEGIN
  SELECT a.* INTO v_assign FROM public.employee_shift_assignments a
    WHERE a.employee_id = NEW.employee_id AND a.active = true AND a.start_date <= NEW.event_date AND (a.end_date IS NULL OR a.end_date >= NEW.event_date)
    ORDER BY a.start_date DESC LIMIT 1;
  IF v_assign.id IS NOT NULL THEN SELECT * INTO v_shift FROM public.shifts WHERE id = v_assign.shift_id; END IF;
  IF v_shift.id IS NOT NULL THEN
    v_deadline := NEW.event_date + v_shift.end_time + make_interval(mins => COALESCE(v_shift.exit_grace_minutes,5));
    IF v_shift.end_time < v_shift.start_time THEN v_deadline := v_deadline + interval '1 day'; END IF;
  END IF;

  INSERT INTO public.daily_attendance_summary(employee_id, attendance_date, shift_id, expected_entry_time, expected_exit_time, expected_lunch_start_time, expected_lunch_end_time, shift_close_deadline, status, close_status)
  VALUES (NEW.employee_id, NEW.event_date, v_assign.shift_id, v_shift.start_time, v_shift.end_time, v_shift.lunch_start_time, v_shift.lunch_end_time, v_deadline, 'pending', 'open')
  ON CONFLICT (employee_id, attendance_date) DO UPDATE SET
    shift_id=EXCLUDED.shift_id, expected_entry_time=EXCLUDED.expected_entry_time, expected_exit_time=EXCLUDED.expected_exit_time,
    expected_lunch_start_time=EXCLUDED.expected_lunch_start_time, expected_lunch_end_time=EXCLUDED.expected_lunch_end_time,
    shift_close_deadline=EXCLUDED.shift_close_deadline, updated_at=now();

  IF NEW.event_type = 'ENTRY' THEN
    IF v_shift.id IS NOT NULL THEN
      v_late := GREATEST(0, EXTRACT(EPOCH FROM (NEW.event_time - (NEW.event_date + v_shift.start_time)))::int / 60);
      v_late_after := GREATEST(0, v_late - v_shift.tolerance_minutes);
      UPDATE public.daily_attendance_summary
      SET actual_entry_time=NEW.event_time, late_minutes_total=v_late, late_minutes_after_tolerance=v_late_after,
          has_tardiness=(v_late_after>0), status=CASE WHEN v_late_after>0 THEN 'late' ELSE 'on_time' END,
          has_security_flag=NEW.security_flag, connection_location_status=NEW.connection_location_status, ip_address=NEW.ip_address, updated_at=now()
      WHERE employee_id=NEW.employee_id AND attendance_date=NEW.event_date;
      IF v_late_after > 0 THEN
        INSERT INTO public.tardiness_records(employee_id, attendance_date, expected_time, actual_time, tolerance_minutes, late_minutes, sanctionable_late_minutes, month, year)
        VALUES (NEW.employee_id, NEW.event_date, v_shift.start_time, NEW.event_time, v_shift.tolerance_minutes, v_late, v_late_after, EXTRACT(MONTH FROM NEW.event_date)::int, EXTRACT(YEAR FROM NEW.event_date)::int);
      END IF;
    END IF;
  ELSIF NEW.event_type='LUNCH_START' THEN
    UPDATE public.daily_attendance_summary
    SET lunch_start=NEW.event_time, actual_lunch_start_time=NEW.event_time,
        lunch_status=CASE WHEN NEW.lunch_window_status='too_late' THEN 'started_late' WHEN NEW.lunch_window_status='too_early' THEN 'started_too_early' ELSE 'on_time' END,
        lunch_late=(NEW.lunch_window_status='too_late'), lunch_late_minutes=CASE WHEN NEW.lunch_window_status='too_late' THEN NEW.lunch_deviation_minutes ELSE lunch_late_minutes END,
        lunch_started_too_early=(NEW.lunch_window_status='too_early'), lunch_early_minutes=CASE WHEN NEW.lunch_window_status='too_early' THEN NEW.lunch_deviation_minutes ELSE lunch_early_minutes END,
        lunch_missed=false, lunch_requires_regularization=false, requires_admin_review=requires_admin_review OR NEW.requires_admin_review, updated_at=now()
    WHERE employee_id=NEW.employee_id AND attendance_date=NEW.event_date;
  ELSIF NEW.event_type='LUNCH_END' THEN
    SELECT COALESCE(EXTRACT(EPOCH FROM (NEW.event_time - lunch_start))::int / 60,0) INTO v_lunch_minutes FROM public.daily_attendance_summary WHERE employee_id=NEW.employee_id AND attendance_date=NEW.event_date;
    UPDATE public.daily_attendance_summary
    SET lunch_end=NEW.event_time, actual_lunch_end_time=NEW.event_time, total_lunch_minutes=v_lunch_minutes,
        lunch_overrun=(NEW.lunch_window_status='overrun'), lunch_overrun_minutes=CASE WHEN NEW.lunch_window_status='overrun' THEN NEW.lunch_deviation_minutes ELSE lunch_overrun_minutes END,
        lunch_status=CASE WHEN NEW.lunch_window_status='overrun' THEN 'overrun' ELSE lunch_status END,
        requires_admin_review=requires_admin_review OR NEW.requires_admin_review, updated_at=now()
    WHERE employee_id=NEW.employee_id AND attendance_date=NEW.event_date;
  ELSIF NEW.event_type IN ('PERMISSION_START','PERMISSION_END') THEN
    UPDATE public.daily_attendance_summary SET has_permission=true, updated_at=now() WHERE employee_id=NEW.employee_id AND attendance_date=NEW.event_date;
  ELSIF NEW.event_type IN ('EXTRA_EXIT_START','EXTRA_EXIT_END') THEN
    UPDATE public.daily_attendance_summary SET has_extra_exit=true, updated_at=now() WHERE employee_id=NEW.employee_id AND attendance_date=NEW.event_date;
  ELSIF NEW.event_type='EXIT' THEN
    UPDATE public.daily_attendance_summary
    SET actual_exit_time=NEW.event_time, status=CASE WHEN NEW.status='pending_review' THEN 'pending_review' ELSE status END,
        early_exit=NEW.early_exit, early_exit_minutes=NEW.early_exit_minutes,
        requires_admin_review=requires_admin_review OR NEW.requires_admin_review, updated_at=now()
    WHERE employee_id=NEW.employee_id AND attendance_date=NEW.event_date;
  END IF;

  SELECT
    COALESCE(CASE WHEN actual_entry_time IS NOT NULL AND actual_exit_time IS NOT NULL THEN EXTRACT(EPOCH FROM (actual_exit_time - actual_entry_time))::int / 60 ELSE 0 END,0),
    COALESCE(total_lunch_minutes,0)
  INTO v_gross, v_lunch_minutes
  FROM public.daily_attendance_summary
  WHERE employee_id=NEW.employee_id AND attendance_date=NEW.event_date;
  v_net := GREATEST(0, v_gross - COALESCE(v_lunch_minutes,0));
  UPDATE public.daily_attendance_summary SET worked_minutes_gross=v_gross, worked_minutes_net=v_net WHERE employee_id=NEW.employee_id AND attendance_date=NEW.event_date;

  IF NEW.security_flag THEN
    INSERT INTO public.security_logs(employee_id, attendance_event_id, event_type, ip_address, user_agent, browser_info, device_info, is_company_network, connection_location_status, risk_level, message)
    VALUES (NEW.employee_id, NEW.id, 'flagged_'||NEW.event_type, NEW.ip_address, NEW.user_agent, NEW.browser_info, NEW.device_info, NEW.is_company_network, NEW.connection_location_status, CASE WHEN NEW.connection_location_status='company_network' THEN 'low' ELSE 'medium' END, 'Marcación con bandera de seguridad o revisión.');
    PERFORM public.create_security_alert_if_needed(NEW.employee_id, NEW.id, NEW.ip_address, NEW.connection_location_status);
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE VIEW public.v_daily_attendance_admin AS
SELECT s.employee_id, p.full_name, d.name AS department, w.name AS work_center,
  sh.name AS shift, s.attendance_date, s.expected_entry_time, s.actual_entry_time,
  s.expected_exit_time, s.actual_exit_time, s.expected_lunch_start_time, s.expected_lunch_end_time,
  s.actual_lunch_start_time, s.actual_lunch_end_time, s.status, s.close_status, s.has_tardiness,
  s.late_minutes_total, s.late_minutes_after_tolerance, s.lunch_start, s.lunch_end,
  s.total_lunch_minutes, s.lunch_late, s.lunch_late_minutes, s.lunch_overrun, s.lunch_overrun_minutes,
  s.lunch_status, s.lunch_missed, s.lunch_requires_regularization,
  s.has_permission, s.has_extra_exit, s.is_absent, s.missing_exit, s.early_exit, s.early_exit_minutes,
  s.worked_minutes_gross, s.worked_minutes_net, s.is_justified,
  s.ip_address, (s.connection_location_status='company_network') AS is_company_network,
  s.connection_location_status, s.has_security_flag AS security_flag, s.requires_admin_review
FROM public.daily_attendance_summary s
JOIN public.profiles p ON p.id = s.employee_id
LEFT JOIN public.departments d ON d.id = p.department_id
LEFT JOIN public.work_centers w ON w.id = p.work_center_id
LEFT JOIN public.shifts sh ON sh.id = s.shift_id;
GRANT SELECT ON public.v_daily_attendance_admin TO authenticated;

CREATE OR REPLACE VIEW public.v_monthly_absolute_attendance_report AS
SELECT EXTRACT(MONTH FROM s.attendance_date)::int AS month, EXTRACT(YEAR FROM s.attendance_date)::int AS year,
  s.employee_id, p.full_name, d.name AS department, w.name AS work_center, s.attendance_date,
  sh.name AS shift_name, s.expected_entry_time, s.actual_entry_time, s.expected_exit_time, s.actual_exit_time,
  s.expected_lunch_start_time, s.expected_lunch_end_time, s.actual_lunch_start_time, s.actual_lunch_end_time,
  s.lunch_start, s.lunch_end,
  (SELECT min(event_time) FROM public.attendance_events e WHERE e.employee_id=s.employee_id AND e.event_date=s.attendance_date AND e.event_type='PERMISSION_START') AS permission_start,
  (SELECT max(event_time) FROM public.attendance_events e WHERE e.employee_id=s.employee_id AND e.event_date=s.attendance_date AND e.event_type='PERMISSION_END') AS permission_end,
  (SELECT min(event_time) FROM public.attendance_events e WHERE e.employee_id=s.employee_id AND e.event_date=s.attendance_date AND e.event_type='EXTRA_EXIT_START') AS extra_exit_start,
  (SELECT max(event_time) FROM public.attendance_events e WHERE e.employee_id=s.employee_id AND e.event_date=s.attendance_date AND e.event_type='EXTRA_EXIT_END') AS extra_exit_end,
  s.status, s.close_status, s.late_minutes_total, s.late_minutes_after_tolerance, s.total_lunch_minutes,
  s.lunch_late, s.lunch_late_minutes, s.lunch_started_too_early, s.lunch_early_minutes, s.lunch_overrun, s.lunch_overrun_minutes, s.lunch_status,
  s.lunch_missed, s.lunch_requires_regularization, s.early_exit, s.early_exit_minutes, s.worked_minutes_gross, s.worked_minutes_net,
  s.is_absent, s.missing_exit, s.is_justified, s.ip_address, s.connection_location_status, s.has_security_flag AS security_flag,
  CASE WHEN s.missing_exit THEN 'Falta salida final' WHEN s.early_exit THEN 'Salida anticipada' WHEN s.lunch_missed THEN 'Almuerzo no registrado en franja' WHEN s.lunch_late THEN 'Almuerzo fuera de franja' WHEN s.lunch_overrun THEN 'Exceso de almuerzo' WHEN s.requires_admin_review THEN 'Requiere revisión' END AS observations
FROM public.daily_attendance_summary s
JOIN public.profiles p ON p.id=s.employee_id
LEFT JOIN public.departments d ON d.id=p.department_id
LEFT JOIN public.work_centers w ON w.id=p.work_center_id
LEFT JOIN public.shifts sh ON sh.id=s.shift_id;
GRANT SELECT ON public.v_monthly_absolute_attendance_report TO authenticated;

INSERT INTO public.system_settings(setting_key, setting_value, description) VALUES
('strict_lunch_window_enabled','true','Almuerzo solo dentro de franja del turno'),
('show_worked_hours_on_worker_screen','true','Mostrar horas trabajadas del día')
ON CONFLICT (setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value, description=EXCLUDED.description;

-- ============================================================
-- GrupMar Time — Control avanzado de jornada, almuerzo y reporte mensual absoluto
-- ============================================================

-- Campos de turnos: entrada anticipada, cierre, almuerzo y horas extra
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS early_clockin_window_minutes integer NOT NULL DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS exit_grace_minutes integer NOT NULL DEFAULT 5;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS allow_early_clockin_without_approval boolean NOT NULL DEFAULT false;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS allow_overtime_without_approval boolean NOT NULL DEFAULT false;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS require_admin_approval_for_overtime boolean NOT NULL DEFAULT true;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS block_clocking_after_shift_close boolean NOT NULL DEFAULT true;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS auto_close_shift_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS lunch_start_time time;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS lunch_end_time time;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS lunch_grace_minutes integer NOT NULL DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS allow_lunch_outside_window boolean NOT NULL DEFAULT true;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS require_admin_approval_for_lunch_outside_window boolean NOT NULL DEFAULT true;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS max_lunch_minutes integer NOT NULL DEFAULT 60;

UPDATE public.shifts
SET lunch_start_time = COALESCE(lunch_start_time, CASE WHEN start_time <= time '09:00' THEN time '13:00' ELSE time '14:00' END),
    lunch_end_time = COALESCE(lunch_end_time, CASE WHEN start_time <= time '09:00' THEN time '14:00' ELSE time '15:00' END),
    exit_grace_minutes = COALESCE(exit_grace_minutes, 5),
    early_clockin_window_minutes = COALESCE(early_clockin_window_minutes, 0),
    max_lunch_minutes = COALESCE(max_lunch_minutes, lunch_minutes, 60);

-- Campos de marcaciones
ALTER TABLE public.attendance_events ADD COLUMN IF NOT EXISTS is_early_clockin boolean NOT NULL DEFAULT false;
ALTER TABLE public.attendance_events ADD COLUMN IF NOT EXISTS early_clockin_minutes integer NOT NULL DEFAULT 0;
ALTER TABLE public.attendance_events ADD COLUMN IF NOT EXISTS early_clockin_authorized boolean NOT NULL DEFAULT false;
ALTER TABLE public.attendance_events ADD COLUMN IF NOT EXISTS potential_overtime boolean NOT NULL DEFAULT false;
ALTER TABLE public.attendance_events ADD COLUMN IF NOT EXISTS overtime_minutes integer NOT NULL DEFAULT 0;
ALTER TABLE public.attendance_events ADD COLUMN IF NOT EXISTS overtime_status text NOT NULL DEFAULT 'none' CHECK (overtime_status IN ('none','pending','approved','rejected'));
ALTER TABLE public.attendance_events ADD COLUMN IF NOT EXISTS requires_admin_review boolean NOT NULL DEFAULT false;
ALTER TABLE public.attendance_events ADD COLUMN IF NOT EXISTS is_lunch_event boolean NOT NULL DEFAULT false;
ALTER TABLE public.attendance_events ADD COLUMN IF NOT EXISTS lunch_window_status text NOT NULL DEFAULT 'not_applicable' CHECK (lunch_window_status IN ('inside_window','too_early','too_late','overrun','pending_review','not_applicable'));
ALTER TABLE public.attendance_events ADD COLUMN IF NOT EXISTS lunch_deviation_minutes integer NOT NULL DEFAULT 0;

-- Campos de resumen diario
ALTER TABLE public.daily_attendance_summary ADD COLUMN IF NOT EXISTS shift_close_deadline timestamptz;
ALTER TABLE public.daily_attendance_summary ADD COLUMN IF NOT EXISTS auto_closed boolean NOT NULL DEFAULT false;
ALTER TABLE public.daily_attendance_summary ADD COLUMN IF NOT EXISTS auto_closed_at timestamptz;
ALTER TABLE public.daily_attendance_summary ADD COLUMN IF NOT EXISTS missing_exit boolean NOT NULL DEFAULT false;
ALTER TABLE public.daily_attendance_summary ADD COLUMN IF NOT EXISTS requires_admin_review boolean NOT NULL DEFAULT false;
ALTER TABLE public.daily_attendance_summary ADD COLUMN IF NOT EXISTS close_status text DEFAULT 'open' CHECK (close_status IN ('open','closed_ok','closed_missing_exit','closed_absent','blocked_after_deadline','pending_review'));
ALTER TABLE public.daily_attendance_summary ADD COLUMN IF NOT EXISTS expected_lunch_start_time time;
ALTER TABLE public.daily_attendance_summary ADD COLUMN IF NOT EXISTS expected_lunch_end_time time;
ALTER TABLE public.daily_attendance_summary ADD COLUMN IF NOT EXISTS actual_lunch_start_time timestamptz;
ALTER TABLE public.daily_attendance_summary ADD COLUMN IF NOT EXISTS actual_lunch_end_time timestamptz;
ALTER TABLE public.daily_attendance_summary ADD COLUMN IF NOT EXISTS lunch_late boolean NOT NULL DEFAULT false;
ALTER TABLE public.daily_attendance_summary ADD COLUMN IF NOT EXISTS lunch_late_minutes integer NOT NULL DEFAULT 0;
ALTER TABLE public.daily_attendance_summary ADD COLUMN IF NOT EXISTS lunch_started_too_early boolean NOT NULL DEFAULT false;
ALTER TABLE public.daily_attendance_summary ADD COLUMN IF NOT EXISTS lunch_early_minutes integer NOT NULL DEFAULT 0;
ALTER TABLE public.daily_attendance_summary ADD COLUMN IF NOT EXISTS lunch_overrun boolean NOT NULL DEFAULT false;
ALTER TABLE public.daily_attendance_summary ADD COLUMN IF NOT EXISTS lunch_overrun_minutes integer NOT NULL DEFAULT 0;
ALTER TABLE public.daily_attendance_summary ADD COLUMN IF NOT EXISTS lunch_status text DEFAULT 'not_started' CHECK (lunch_status IN ('not_started','on_time','started_too_early','started_late','overrun','pending_review','justified'));

-- Intentos bloqueados / pendientes
CREATE TABLE IF NOT EXISTS public.attendance_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  attempted_event_type text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  scheduled_time time,
  deadline_time timestamptz,
  reason text,
  ip_address text,
  user_agent text,
  connection_location_status text,
  status text NOT NULL DEFAULT 'blocked' CHECK (status IN ('blocked','pending_approval','approved','rejected')),
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attempts_emp ON public.attendance_attempts(employee_id, attempted_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.attendance_attempts TO authenticated;
GRANT ALL ON public.attendance_attempts TO service_role;
ALTER TABLE public.attendance_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users view own attempts" ON public.attendance_attempts;
DROP POLICY IF EXISTS "admin manage attempts" ON public.attendance_attempts;
CREATE POLICY "users view own attempts" ON public.attendance_attempts FOR SELECT TO authenticated USING (employee_id = auth.uid() OR public.is_admin());
CREATE POLICY "admin manage attempts" ON public.attendance_attempts FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Horas extra pendientes/aprobadas/rechazadas
CREATE TABLE IF NOT EXISTS public.overtime_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  source text NOT NULL CHECK (source IN ('early_entry','late_exit','manual_request')),
  minutes integer NOT NULL,
  start_time timestamptz,
  end_time timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  reason text,
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_overtime_emp ON public.overtime_requests(employee_id, attendance_date DESC);
GRANT SELECT, INSERT, UPDATE ON public.overtime_requests TO authenticated;
GRANT ALL ON public.overtime_requests TO service_role;
ALTER TABLE public.overtime_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users view own overtime" ON public.overtime_requests;
DROP POLICY IF EXISTS "admin manage overtime" ON public.overtime_requests;
CREATE POLICY "users view own overtime" ON public.overtime_requests FOR SELECT TO authenticated USING (employee_id = auth.uid() OR public.is_admin());
CREATE POLICY "admin manage overtime" ON public.overtime_requests FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Reporte mensual absoluto
CREATE TABLE IF NOT EXISTS public.monthly_attendance_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month integer NOT NULL,
  year integer NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'generated' CHECK (status IN ('draft','generated','reviewed','exported','closed')),
  total_employees integer DEFAULT 0,
  total_working_days integer DEFAULT 0,
  total_entries integer DEFAULT 0,
  total_exits integer DEFAULT 0,
  total_missing_exits integer DEFAULT 0,
  total_absences integer DEFAULT 0,
  total_tardiness integer DEFAULT 0,
  total_permissions integer DEFAULT 0,
  total_extra_exits integer DEFAULT 0,
  total_lunch_events integer DEFAULT 0,
  total_outside_company_clockings integer DEFAULT 0,
  total_unknown_ip_clockings integer DEFAULT 0,
  total_security_alerts integer DEFAULT 0,
  total_disciplinary_letters integer DEFAULT 0,
  csv_url text,
  pdf_url text,
  UNIQUE(month, year)
);
CREATE TABLE IF NOT EXISTS public.monthly_attendance_report_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES public.monthly_attendance_reports(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.profiles(id),
  attendance_date date,
  shift_id uuid REFERENCES public.shifts(id),
  expected_entry_time time,
  actual_entry_time timestamptz,
  expected_exit_time time,
  actual_exit_time timestamptz,
  expected_lunch_start_time time,
  expected_lunch_end_time time,
  actual_lunch_start_time timestamptz,
  actual_lunch_end_time timestamptz,
  lunch_start timestamptz,
  lunch_end timestamptz,
  permission_start timestamptz,
  permission_end timestamptz,
  extra_exit_start timestamptz,
  extra_exit_end timestamptz,
  late_minutes_total integer,
  late_minutes_after_tolerance integer,
  total_lunch_minutes integer,
  lunch_late boolean,
  lunch_late_minutes integer,
  lunch_started_too_early boolean,
  lunch_early_minutes integer,
  lunch_overrun boolean,
  lunch_overrun_minutes integer,
  lunch_status text,
  status text,
  close_status text,
  is_absent boolean,
  missing_exit boolean,
  is_justified boolean,
  ip_address text,
  connection_location_status text,
  security_flag boolean,
  observations text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_attendance_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_attendance_report_details TO authenticated;
GRANT ALL ON public.monthly_attendance_reports, public.monthly_attendance_report_details TO service_role;
ALTER TABLE public.monthly_attendance_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_attendance_report_details ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin manage monthly reports" ON public.monthly_attendance_reports;
DROP POLICY IF EXISTS "admin view monthly details" ON public.monthly_attendance_report_details;
CREATE POLICY "admin manage monthly reports" ON public.monthly_attendance_reports FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin view monthly details" ON public.monthly_attendance_report_details FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Configuración
INSERT INTO public.system_settings(setting_key, setting_value, description) VALUES
('exit_grace_minutes','5','Minutos máximos para registrar salida tras el fin del turno'),
('block_clocking_after_shift_close','true','Bloquear marcaciones tras cierre de turno'),
('allow_late_exit_without_review','false','Permitir salida tardía sin revisión'),
('require_admin_review_for_missing_exit','true','Exigir revisión si falta salida'),
('auto_close_shift_enabled','true','Cerrar jornadas automáticamente tras deadline'),
('monthly_absolute_report_enabled','true','Activar reporte mensual absoluto'),
('early_clockin_window_minutes','0','Ventana de entrada anticipada por defecto'),
('allow_early_clockin_without_approval','false','Permitir entrada anticipada sin autorización'),
('allow_overtime_without_approval','false','Permitir horas extra sin aprobación'),
('require_admin_approval_for_overtime','true','Exigir aprobación de horas extra'),
('allow_lunch_outside_window','true','Permitir registrar almuerzo fuera de ventana, dejando incidencia'),
('require_admin_approval_for_lunch_outside_window','true','Revisar almuerzo fuera de ventana')
ON CONFLICT (setting_key) DO NOTHING;

-- Helper: turno activo del trabajador
CREATE OR REPLACE FUNCTION public.get_active_shift_for_employee(p_employee uuid, p_date date)
RETURNS TABLE(
  assignment_id uuid, shift_id uuid, shift_name text, start_time time, end_time time,
  lunch_start_time time, lunch_end_time time, lunch_minutes integer, max_lunch_minutes integer,
  tolerance_minutes integer, early_clockin_window_minutes integer, exit_grace_minutes integer,
  allow_early_clockin_without_approval boolean, allow_overtime_without_approval boolean,
  require_admin_approval_for_overtime boolean, block_clocking_after_shift_close boolean,
  auto_close_shift_enabled boolean, allow_lunch_outside_window boolean,
  require_admin_approval_for_lunch_outside_window boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.id, s.id, s.name, s.start_time, s.end_time,
    COALESCE(s.lunch_start_time, time '13:00'), COALESCE(s.lunch_end_time, time '14:00'),
    s.lunch_minutes, COALESCE(s.max_lunch_minutes, s.lunch_minutes, 60), s.tolerance_minutes,
    COALESCE(s.early_clockin_window_minutes,0), COALESCE(s.exit_grace_minutes,5),
    COALESCE(s.allow_early_clockin_without_approval,false), COALESCE(s.allow_overtime_without_approval,false),
    COALESCE(s.require_admin_approval_for_overtime,true), COALESCE(s.block_clocking_after_shift_close,true),
    COALESCE(s.auto_close_shift_enabled,true), COALESCE(s.allow_lunch_outside_window,true),
    COALESCE(s.require_admin_approval_for_lunch_outside_window,true)
  FROM public.employee_shift_assignments a
  JOIN public.shifts s ON s.id = a.shift_id
  WHERE a.employee_id = p_employee AND a.active = true AND s.active = true
    AND a.start_date <= p_date AND (a.end_date IS NULL OR a.end_date >= p_date)
  ORDER BY a.start_date DESC
  LIMIT 1;
$$;

-- register_entry_on_login con entrada anticipada y cierre de jornada
CREATE OR REPLACE FUNCTION public.register_entry_on_login(
  client_ip text, p_user_agent text, p_browser text DEFAULT NULL, p_device text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid(); v_profile public.profiles; v_event_id uuid; v_existing public.attendance_events;
  v_allowed_ip text; v_is_company boolean; v_loc text; v_allow_outside boolean;
  v_today date := current_date; v_now timestamptz := now(); v_shift record;
  v_start_ts timestamptz; v_early_allowed_ts timestamptz; v_end_ts timestamptz; v_deadline timestamptz;
  v_late integer := 0; v_late_after integer := 0; v_is_late boolean := false; v_message text;
  v_close_status text;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','no_session'); END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;
  IF v_profile.id IS NULL OR v_profile.active = false THEN RETURN jsonb_build_object('error','profile_inactive'); END IF;

  v_allowed_ip := public.get_setting('allowed_company_ip');
  v_allow_outside := COALESCE(public.get_setting('allow_outside_company_clocking')='true', true);
  v_is_company := (client_ip IS NOT NULL AND client_ip = v_allowed_ip);
  v_loc := CASE WHEN client_ip IS NULL OR client_ip = '' THEN 'unknown' WHEN v_is_company THEN 'company_network' ELSE 'outside_company_network' END;

  IF v_loc <> 'company_network' AND v_allow_outside = false THEN
    INSERT INTO public.security_logs(employee_id, event_type, ip_address, user_agent, browser_info, device_info, is_company_network, connection_location_status, risk_level, message)
    VALUES (v_uid, 'blocked_entry_attempt', client_ip, p_user_agent, p_browser, p_device, false, 'blocked', 'high', 'Intento de marcación bloqueado por IP no autorizada.');
    RETURN jsonb_build_object('blocked', true, 'message','No se puede registrar la marcación porque no está conectado desde la red autorizada de la empresa.');
  END IF;

  SELECT * INTO v_shift FROM public.get_active_shift_for_employee(v_uid, v_today);
  IF v_shift.shift_id IS NULL THEN
    RETURN jsonb_build_object('blocked', true, 'message','No tiene turno asignado para hoy. Contacte con su responsable.', 'server_time', v_now);
  END IF;

  v_start_ts := v_today + v_shift.start_time;
  v_early_allowed_ts := v_start_ts - make_interval(mins => COALESCE(v_shift.early_clockin_window_minutes,0));
  v_end_ts := v_today + v_shift.end_time;
  IF v_shift.end_time < v_shift.start_time THEN v_end_ts := v_end_ts + interval '1 day'; END IF;
  v_deadline := v_end_ts + make_interval(mins => COALESCE(v_shift.exit_grace_minutes,5));

  SELECT close_status INTO v_close_status FROM public.daily_attendance_summary WHERE employee_id=v_uid AND attendance_date=v_today;
  IF COALESCE(v_close_status,'open') <> 'open' THEN
    RETURN jsonb_build_object('blocked', true, 'closed', true, 'message','Su jornada laboral ya finalizó y el sistema de marcaciones se encuentra cerrado. Podrá volver a registrar marcaciones en su siguiente jornada laboral.', 'server_time', v_now, 'shift_close_deadline', v_deadline);
  END IF;

  SELECT * INTO v_existing FROM public.attendance_events WHERE employee_id=v_uid AND event_date=v_today AND event_type='ENTRY' ORDER BY event_time ASC LIMIT 1;

  IF v_existing.id IS NULL THEN
    IF v_now < v_early_allowed_ts AND COALESCE(v_shift.allow_early_clockin_without_approval,false) = false THEN
      INSERT INTO public.attendance_attempts(employee_id, attempted_event_type, attempted_at, scheduled_time, deadline_time, reason, ip_address, user_agent, connection_location_status, status)
      VALUES (v_uid, 'ENTRY', v_now, v_shift.start_time, v_start_ts, 'early_clockin_blocked', client_ip, p_user_agent, v_loc, 'blocked');
      INSERT INTO public.alerts(employee_id, alert_type, severity, title, message)
      VALUES (v_uid, 'early_clockin_blocked', 'warning', 'Entrada anticipada bloqueada', format('El trabajador %s intentó registrar entrada antes de su turno. Turno: %s. Hora intentada: %s.', v_profile.full_name, to_char(v_shift.start_time,'HH24:MI'), to_char(v_now,'HH24:MI')));
      RETURN jsonb_build_object('blocked', true, 'message', format('Su turno inicia a las %s. No puede registrar entrada antes del horario autorizado. Si necesita iniciar antes, solicite autorización a su responsable.', to_char(v_shift.start_time,'HH24:MI')), 'server_time', v_now, 'expected_time', v_shift.start_time);
    END IF;

    IF v_now > v_deadline THEN
      INSERT INTO public.attendance_attempts(employee_id, attempted_event_type, attempted_at, scheduled_time, deadline_time, reason, ip_address, user_agent, connection_location_status, status)
      VALUES (v_uid, 'ENTRY', v_now, v_shift.start_time, v_deadline, 'login_after_shift_closed', client_ip, p_user_agent, v_loc, 'blocked');
      RETURN jsonb_build_object('blocked', true, 'closed', true, 'message','Su jornada laboral ya finalizó y el sistema de marcaciones se encuentra cerrado. Podrá volver a registrar marcaciones en su siguiente jornada laboral.', 'server_time', v_now, 'shift_close_deadline', v_deadline);
    END IF;

    INSERT INTO public.attendance_events(employee_id, event_type, event_time, event_date, source, ip_address, user_agent, browser_info, device_info, connection_location_status, is_company_network, security_flag, created_by, is_early_clockin, early_clockin_minutes, early_clockin_authorized)
    VALUES (v_uid, 'ENTRY', v_now, v_today, 'login', client_ip, p_user_agent, p_browser, p_device, v_loc, v_is_company, NOT v_is_company, v_uid, v_now < v_start_ts, GREATEST(0, EXTRACT(EPOCH FROM (v_start_ts - v_now))::int / 60), v_now < v_start_ts AND v_shift.allow_early_clockin_without_approval)
    RETURNING id INTO v_event_id;
  ELSE
    v_event_id := v_existing.id;
    v_now := v_existing.event_time;
  END IF;

  v_late := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_start_ts))::int / 60);
  v_late_after := GREATEST(0, v_late - COALESCE(v_shift.tolerance_minutes,10));
  v_is_late := v_late_after > 0;
  v_message := CASE WHEN v_is_late THEN format('Usted ha llegado tarde. Tardanza calculada: %s minutos fuera de tolerancia.', v_late_after) ELSE 'A tiempo' END;

  RETURN jsonb_build_object(
    'event_id', v_event_id, 'full_name', v_profile.full_name, 'event_time', v_now, 'server_time', now(),
    'expected_time', v_shift.start_time, 'shift_end_time', v_shift.end_time, 'shift_close_deadline', v_deadline,
    'exit_grace_minutes', v_shift.exit_grace_minutes, 'lunch_start_time', v_shift.lunch_start_time,
    'lunch_end_time', v_shift.lunch_end_time, 'max_lunch_minutes', v_shift.max_lunch_minutes,
    'is_late', v_is_late, 'late_minutes_total', v_late, 'late_minutes_after_tolerance', v_late_after,
    'ip_address', client_ip, 'is_company_network', v_is_company, 'connection_location_status', v_loc,
    'security_flag', NOT v_is_company, 'message', v_message
  );
END $$;

-- register_attendance_event con cierre, almuerzo por franja y salida máximo 5 min
CREATE OR REPLACE FUNCTION public.register_attendance_event(
  p_event_type text, p_notes text DEFAULT NULL, client_ip text DEFAULT NULL, p_user_agent text DEFAULT NULL, p_browser text DEFAULT NULL, p_device text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid(); v_profile public.profiles; v_event_id uuid;
  v_today date := current_date; v_now timestamptz := now(); v_shift record;
  v_allowed_ip text; v_is_company boolean; v_loc text; v_allow_outside boolean;
  v_has_open_lunch boolean; v_has_open_perm boolean; v_has_open_extra boolean; v_has_entry boolean;
  v_start_ts timestamptz; v_end_ts timestamptz; v_deadline timestamptz; v_lunch_start_ts timestamptz; v_lunch_end_ts timestamptz;
  v_lunch_start_event timestamptz; v_lunch_minutes integer := 0; v_lunch_deviation integer := 0; v_requires_review boolean := false;
  v_status text := 'valid'; v_lunch_status text := 'not_applicable'; v_message text; v_early_exit_minutes integer := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','no_session'); END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;
  IF v_profile.id IS NULL OR v_profile.active = false THEN RETURN jsonb_build_object('error','profile_inactive'); END IF;
  IF p_event_type NOT IN ('LUNCH_START','LUNCH_END','PERMISSION_START','PERMISSION_END','EXTRA_EXIT_START','EXTRA_EXIT_END','EXIT') THEN RETURN jsonb_build_object('error','invalid_event_type'); END IF;

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
  IF NOT v_has_entry THEN RETURN jsonb_build_object('error','no_entry_today'); END IF;

  IF COALESCE(v_shift.block_clocking_after_shift_close,true) AND v_now > v_deadline THEN
    INSERT INTO public.attendance_attempts(employee_id, attempted_event_type, attempted_at, scheduled_time, deadline_time, reason, ip_address, user_agent, connection_location_status, status)
    VALUES (v_uid, p_event_type, v_now, CASE WHEN p_event_type='EXIT' THEN v_shift.end_time ELSE NULL END, v_deadline, CASE WHEN p_event_type='EXIT' THEN 'late_exit_blocked' ELSE 'shift_closed' END, client_ip, p_user_agent, v_loc, 'blocked');
    INSERT INTO public.alerts(employee_id, alert_type, severity, title, message)
    VALUES (v_uid, CASE WHEN p_event_type='EXIT' THEN 'late_exit_blocked' ELSE 'shift_closed' END, 'warning', 'Marcación bloqueada por cierre de jornada', format('El trabajador %s intentó registrar %s después del cierre de jornada. Deadline: %s. Hora intentada: %s.', v_profile.full_name, p_event_type, to_char(v_deadline,'HH24:MI'), to_char(v_now,'HH24:MI')));
    RETURN jsonb_build_object('blocked', true, 'closed', true, 'message', format('Su jornada terminó a las %s y el margen máximo para registrar salida era hasta las %s. El sistema ya se encuentra cerrado. Contacte con su responsable para regularizar la incidencia.', to_char(v_shift.end_time,'HH24:MI'), to_char(v_deadline,'HH24:MI')));
  END IF;

  v_has_open_lunch := EXISTS(SELECT 1 FROM public.attendance_events e WHERE e.employee_id=v_uid AND e.event_date=v_today AND e.event_type='LUNCH_START' AND NOT EXISTS (SELECT 1 FROM public.attendance_events e2 WHERE e2.employee_id=v_uid AND e2.event_date=v_today AND e2.event_type='LUNCH_END' AND e2.event_time > e.event_time));
  v_has_open_perm := EXISTS(SELECT 1 FROM public.attendance_events e WHERE e.employee_id=v_uid AND e.event_date=v_today AND e.event_type='PERMISSION_START' AND NOT EXISTS (SELECT 1 FROM public.attendance_events e2 WHERE e2.employee_id=v_uid AND e2.event_date=v_today AND e2.event_type='PERMISSION_END' AND e2.event_time > e.event_time));
  v_has_open_extra := EXISTS(SELECT 1 FROM public.attendance_events e WHERE e.employee_id=v_uid AND e.event_date=v_today AND e.event_type='EXTRA_EXIT_START' AND NOT EXISTS (SELECT 1 FROM public.attendance_events e2 WHERE e2.employee_id=v_uid AND e2.event_date=v_today AND e2.event_type='EXTRA_EXIT_END' AND e2.event_time > e.event_time));

  IF p_event_type='LUNCH_START' AND v_has_open_lunch THEN RETURN jsonb_build_object('error','lunch_already_open'); END IF;
  IF p_event_type='LUNCH_END' AND NOT v_has_open_lunch THEN RETURN jsonb_build_object('error','no_open_lunch'); END IF;
  IF p_event_type='PERMISSION_END' AND NOT v_has_open_perm THEN RETURN jsonb_build_object('error','no_open_permission'); END IF;
  IF p_event_type='EXTRA_EXIT_END' AND NOT v_has_open_extra THEN RETURN jsonb_build_object('error','no_open_extra_exit'); END IF;
  IF p_event_type='PERMISSION_START' AND v_has_open_perm THEN RETURN jsonb_build_object('error','permission_already_open'); END IF;
  IF p_event_type='EXTRA_EXIT_START' AND v_has_open_extra THEN RETURN jsonb_build_object('error','extra_exit_already_open'); END IF;
  IF p_event_type='EXIT' AND (v_has_open_lunch OR v_has_open_perm OR v_has_open_extra) THEN RETURN jsonb_build_object('error','open_event_blocks_exit'); END IF;
  IF p_event_type='EXIT' AND EXISTS(SELECT 1 FROM public.attendance_events WHERE employee_id=v_uid AND event_date=v_today AND event_type='EXIT') THEN RETURN jsonb_build_object('error','exit_already_registered'); END IF;

  IF p_event_type='LUNCH_START' THEN
    IF v_now < v_lunch_start_ts THEN
      INSERT INTO public.attendance_attempts(employee_id, attempted_event_type, attempted_at, scheduled_time, deadline_time, reason, ip_address, user_agent, connection_location_status, status)
      VALUES (v_uid, 'LUNCH_START', v_now, v_shift.lunch_start_time, v_lunch_start_ts, 'lunch_started_too_early', client_ip, p_user_agent, v_loc, 'blocked');
      INSERT INTO public.alerts(employee_id, alert_type, severity, title, message)
      VALUES (v_uid, 'lunch_started_too_early', 'warning', 'Almuerzo anticipado bloqueado', format('El trabajador %s intentó iniciar almuerzo antes de su horario. Permitido: %s - %s. Hora intentada: %s.', v_profile.full_name, to_char(v_shift.lunch_start_time,'HH24:MI'), to_char(v_shift.lunch_end_time,'HH24:MI'), to_char(v_now,'HH24:MI')));
      RETURN jsonb_build_object('blocked', true, 'message', format('Su horario de almuerzo inicia a las %s. No puede iniciar almuerzo antes del horario asignado.', to_char(v_shift.lunch_start_time,'HH24:MI')));
    ELSIF v_now > v_lunch_end_ts THEN
      v_requires_review := true; v_status := 'pending_review'; v_lunch_status := 'too_late';
      v_lunch_deviation := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_lunch_end_ts))::int / 60);
      INSERT INTO public.attendance_attempts(employee_id, attempted_event_type, attempted_at, scheduled_time, deadline_time, reason, ip_address, user_agent, connection_location_status, status)
      VALUES (v_uid, 'LUNCH_START', v_now, v_shift.lunch_start_time, v_lunch_end_ts, 'lunch_started_late', client_ip, p_user_agent, v_loc, 'pending_approval');
      INSERT INTO public.alerts(employee_id, alert_type, severity, title, message)
      VALUES (v_uid, 'lunch_started_late', 'warning', 'Almuerzo iniciado fuera de franja', format('El trabajador %s inició almuerzo fuera de la franja asignada. Permitido: %s - %s. Hora real: %s. Desviación: %s minutos.', v_profile.full_name, to_char(v_shift.lunch_start_time,'HH24:MI'), to_char(v_shift.lunch_end_time,'HH24:MI'), to_char(v_now,'HH24:MI'), v_lunch_deviation));
      v_message := 'Almuerzo registrado fuera de horario. Esta incidencia será notificada a su responsable.';
    ELSE
      v_lunch_status := 'inside_window';
    END IF;
  END IF;

  IF p_event_type='LUNCH_END' THEN
    SELECT event_time INTO v_lunch_start_event FROM public.attendance_events WHERE employee_id=v_uid AND event_date=v_today AND event_type='LUNCH_START' ORDER BY event_time DESC LIMIT 1;
    v_lunch_minutes := COALESCE(EXTRACT(EPOCH FROM (v_now - v_lunch_start_event))::int / 60,0);
    IF v_lunch_minutes > COALESCE(v_shift.max_lunch_minutes,60) THEN
      v_requires_review := true; v_status := 'pending_review'; v_lunch_status := 'overrun';
      v_lunch_deviation := v_lunch_minutes - COALESCE(v_shift.max_lunch_minutes,60);
      INSERT INTO public.alerts(employee_id, alert_type, severity, title, message)
      VALUES (v_uid, 'lunch_overrun', 'warning', 'Exceso de almuerzo', format('El trabajador %s superó el tiempo máximo de almuerzo. Permitido: %s minutos. Exceso: %s minutos.', v_profile.full_name, v_shift.max_lunch_minutes, v_lunch_deviation));
      v_message := 'Ha superado el tiempo máximo de almuerzo permitido. Esta incidencia será notificada a su responsable.';
    ELSE
      v_lunch_status := 'inside_window';
    END IF;
  END IF;

  IF p_event_type='EXIT' AND v_now < v_end_ts THEN
    v_requires_review := true; v_status := 'pending_review';
    v_early_exit_minutes := GREATEST(0, EXTRACT(EPOCH FROM (v_end_ts - v_now))::int / 60);
    INSERT INTO public.alerts(employee_id, alert_type, severity, title, message)
    VALUES (v_uid, 'early_exit', 'warning', 'Salida anticipada', format('El trabajador %s registró salida antes del fin del turno. Fin esperado: %s. Salida: %s. Diferencia: %s minutos.', v_profile.full_name, to_char(v_shift.end_time,'HH24:MI'), to_char(v_now,'HH24:MI'), v_early_exit_minutes));
  END IF;

  INSERT INTO public.attendance_events(employee_id, event_type, event_time, event_date, source, ip_address, user_agent, browser_info, device_info, connection_location_status, is_company_network, security_flag, notes, created_by, status, requires_admin_review, is_lunch_event, lunch_window_status, lunch_deviation_minutes)
  VALUES (v_uid, p_event_type, v_now, v_today, 'web', client_ip, p_user_agent, p_browser, p_device, v_loc, v_is_company, NOT v_is_company OR v_requires_review, p_notes, v_uid, v_status, v_requires_review, p_event_type IN ('LUNCH_START','LUNCH_END'), v_lunch_status, v_lunch_deviation)
  RETURNING id INTO v_event_id;

  RETURN jsonb_build_object('event_id', v_event_id, 'event_type', p_event_type, 'event_time', v_now, 'connection_location_status', v_loc, 'is_company_network', v_is_company, 'requires_admin_review', v_requires_review, 'message', COALESCE(v_message, 'Marcación registrada'));
END $$;

-- Trigger summary mejorado
CREATE OR REPLACE FUNCTION public.fn_attendance_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_assign public.employee_shift_assignments; v_shift public.shifts; v_late integer := 0; v_late_after integer := 0; v_lunch_minutes integer := 0; v_deadline timestamptz;
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
      UPDATE public.daily_attendance_summary SET actual_entry_time=NEW.event_time, late_minutes_total=v_late, late_minutes_after_tolerance=v_late_after, has_tardiness=(v_late_after>0), status=CASE WHEN v_late_after>0 THEN 'late' ELSE 'on_time' END, has_security_flag=NEW.security_flag, connection_location_status=NEW.connection_location_status, ip_address=NEW.ip_address, updated_at=now() WHERE employee_id=NEW.employee_id AND attendance_date=NEW.event_date;
      IF v_late_after > 0 THEN
        INSERT INTO public.tardiness_records(employee_id, attendance_date, expected_time, actual_time, tolerance_minutes, late_minutes, sanctionable_late_minutes, month, year)
        VALUES (NEW.employee_id, NEW.event_date, v_shift.start_time, NEW.event_time, v_shift.tolerance_minutes, v_late, v_late_after, EXTRACT(MONTH FROM NEW.event_date)::int, EXTRACT(YEAR FROM NEW.event_date)::int);
      END IF;
    END IF;
  ELSIF NEW.event_type='LUNCH_START' THEN
    UPDATE public.daily_attendance_summary SET lunch_start=NEW.event_time, actual_lunch_start_time=NEW.event_time, lunch_status=CASE WHEN NEW.lunch_window_status='too_late' THEN 'started_late' WHEN NEW.lunch_window_status='too_early' THEN 'started_too_early' ELSE 'on_time' END, lunch_late=(NEW.lunch_window_status='too_late'), lunch_late_minutes=CASE WHEN NEW.lunch_window_status='too_late' THEN NEW.lunch_deviation_minutes ELSE lunch_late_minutes END, lunch_started_too_early=(NEW.lunch_window_status='too_early'), lunch_early_minutes=CASE WHEN NEW.lunch_window_status='too_early' THEN NEW.lunch_deviation_minutes ELSE lunch_early_minutes END, requires_admin_review=requires_admin_review OR NEW.requires_admin_review, updated_at=now() WHERE employee_id=NEW.employee_id AND attendance_date=NEW.event_date;
  ELSIF NEW.event_type='LUNCH_END' THEN
    SELECT COALESCE(EXTRACT(EPOCH FROM (NEW.event_time - lunch_start))::int / 60,0) INTO v_lunch_minutes FROM public.daily_attendance_summary WHERE employee_id=NEW.employee_id AND attendance_date=NEW.event_date;
    UPDATE public.daily_attendance_summary SET lunch_end=NEW.event_time, actual_lunch_end_time=NEW.event_time, total_lunch_minutes=v_lunch_minutes, lunch_overrun=(NEW.lunch_window_status='overrun'), lunch_overrun_minutes=CASE WHEN NEW.lunch_window_status='overrun' THEN NEW.lunch_deviation_minutes ELSE lunch_overrun_minutes END, lunch_status=CASE WHEN NEW.lunch_window_status='overrun' THEN 'overrun' ELSE lunch_status END, requires_admin_review=requires_admin_review OR NEW.requires_admin_review, updated_at=now() WHERE employee_id=NEW.employee_id AND attendance_date=NEW.event_date;
  ELSIF NEW.event_type IN ('PERMISSION_START','PERMISSION_END') THEN
    UPDATE public.daily_attendance_summary SET has_permission=true, updated_at=now() WHERE employee_id=NEW.employee_id AND attendance_date=NEW.event_date;
  ELSIF NEW.event_type IN ('EXTRA_EXIT_START','EXTRA_EXIT_END') THEN
    UPDATE public.daily_attendance_summary SET has_extra_exit=true, updated_at=now() WHERE employee_id=NEW.employee_id AND attendance_date=NEW.event_date;
  ELSIF NEW.event_type='EXIT' THEN
    UPDATE public.daily_attendance_summary SET actual_exit_time=NEW.event_time, status=CASE WHEN NEW.status='pending_review' THEN 'pending_review' ELSE status END, requires_admin_review=requires_admin_review OR NEW.requires_admin_review, updated_at=now() WHERE employee_id=NEW.employee_id AND attendance_date=NEW.event_date;
  END IF;

  IF NEW.security_flag THEN
    INSERT INTO public.security_logs(employee_id, attendance_event_id, event_type, ip_address, user_agent, browser_info, device_info, is_company_network, connection_location_status, risk_level, message)
    VALUES (NEW.employee_id, NEW.id, 'flagged_'||NEW.event_type, NEW.ip_address, NEW.user_agent, NEW.browser_info, NEW.device_info, NEW.is_company_network, NEW.connection_location_status, CASE WHEN NEW.connection_location_status='company_network' THEN 'low' ELSE 'medium' END, 'Marcación con bandera de seguridad o revisión.');
    PERFORM public.create_security_alert_if_needed(NEW.employee_id, NEW.id, NEW.ip_address, NEW.connection_location_status);
  END IF;
  RETURN NEW;
END $$;

-- Cierre automático de jornada
CREATE OR REPLACE FUNCTION public.auto_close_daily_shift(p_date date DEFAULT current_date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r record; v_closed integer := 0; v_deadline timestamptz;
BEGIN
  FOR r IN
    SELECT p.id AS employee_id, p.full_name, a.shift_id, s.start_time, s.end_time, COALESCE(s.exit_grace_minutes,5) exit_grace_minutes
    FROM public.profiles p
    JOIN public.employee_shift_assignments a ON a.employee_id=p.id AND a.active=true AND a.start_date <= p_date AND (a.end_date IS NULL OR a.end_date >= p_date)
    JOIN public.shifts s ON s.id=a.shift_id AND s.active=true
    WHERE p.active=true
  LOOP
    v_deadline := p_date + r.end_time + make_interval(mins => r.exit_grace_minutes);
    IF r.end_time < r.start_time THEN v_deadline := v_deadline + interval '1 day'; END IF;
    IF now() > v_deadline THEN
      IF EXISTS(SELECT 1 FROM public.attendance_events WHERE employee_id=r.employee_id AND event_date=p_date AND event_type='ENTRY') AND NOT EXISTS(SELECT 1 FROM public.attendance_events WHERE employee_id=r.employee_id AND event_date=p_date AND event_type='EXIT') THEN
        INSERT INTO public.daily_attendance_summary(employee_id, attendance_date, shift_id, expected_entry_time, expected_exit_time, shift_close_deadline, status, missing_exit, requires_admin_review, close_status, auto_closed, auto_closed_at)
        VALUES (r.employee_id, p_date, r.shift_id, r.start_time, r.end_time, v_deadline, 'missing_exit', true, true, 'closed_missing_exit', true, now())
        ON CONFLICT(employee_id, attendance_date) DO UPDATE SET missing_exit=true, requires_admin_review=true, close_status='closed_missing_exit', auto_closed=true, auto_closed_at=now(), updated_at=now();
        INSERT INTO public.alerts(employee_id, alert_type, severity, title, message)
        VALUES (r.employee_id, 'missing_exit', 'warning', 'Falta salida final', format('El trabajador %s inició jornada pero no registró salida dentro de la ventana permitida.', r.full_name));
      ELSIF NOT EXISTS(SELECT 1 FROM public.attendance_events WHERE employee_id=r.employee_id AND event_date=p_date AND event_type='ENTRY') THEN
        INSERT INTO public.daily_attendance_summary(employee_id, attendance_date, shift_id, expected_entry_time, expected_exit_time, shift_close_deadline, status, is_absent, requires_admin_review, close_status, auto_closed, auto_closed_at)
        VALUES (r.employee_id, p_date, r.shift_id, r.start_time, r.end_time, v_deadline, 'absent', true, true, 'closed_absent', true, now())
        ON CONFLICT(employee_id, attendance_date) DO UPDATE SET is_absent=true, requires_admin_review=true, close_status='closed_absent', auto_closed=true, auto_closed_at=now(), updated_at=now();
      ELSE
        UPDATE public.daily_attendance_summary SET close_status='closed_ok', auto_closed=true, auto_closed_at=now(), updated_at=now() WHERE employee_id=r.employee_id AND attendance_date=p_date;
      END IF;
      v_closed := v_closed + 1;
    END IF;
  END LOOP;
  RETURN v_closed;
END $$;

-- Vistas actualizadas
DROP VIEW IF EXISTS public.v_daily_attendance_admin;
CREATE OR REPLACE VIEW public.v_daily_attendance_admin AS
SELECT s.employee_id, p.full_name, d.name AS department, w.name AS work_center,
  sh.name AS shift, s.attendance_date, s.expected_entry_time, s.actual_entry_time,
  s.expected_exit_time, s.actual_exit_time, s.expected_lunch_start_time, s.expected_lunch_end_time,
  s.actual_lunch_start_time, s.actual_lunch_end_time, s.status, s.close_status, s.has_tardiness,
  s.late_minutes_total, s.late_minutes_after_tolerance, s.lunch_start, s.lunch_end,
  s.total_lunch_minutes, s.lunch_late, s.lunch_late_minutes, s.lunch_overrun, s.lunch_overrun_minutes,
  s.lunch_status, s.has_permission, s.has_extra_exit, s.is_absent, s.missing_exit, s.is_justified,
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
  s.is_absent, s.missing_exit, s.is_justified, s.ip_address, s.connection_location_status, s.has_security_flag AS security_flag,
  CASE WHEN s.missing_exit THEN 'Falta salida final' WHEN s.lunch_late THEN 'Almuerzo fuera de franja' WHEN s.lunch_overrun THEN 'Exceso de almuerzo' WHEN s.requires_admin_review THEN 'Requiere revisión' END AS observations
FROM public.daily_attendance_summary s
JOIN public.profiles p ON p.id=s.employee_id
LEFT JOIN public.departments d ON d.id=p.department_id
LEFT JOIN public.work_centers w ON w.id=p.work_center_id
LEFT JOIN public.shifts sh ON sh.id=s.shift_id;
GRANT SELECT ON public.v_monthly_absolute_attendance_report TO authenticated;

-- Generar reporte mensual absoluto
CREATE OR REPLACE FUNCTION public.generate_monthly_absolute_report(p_month integer, p_year integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_report uuid; v_start date; v_end date;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_start := make_date(p_year, p_month, 1);
  v_end := (v_start + interval '1 month - 1 day')::date;

  INSERT INTO public.monthly_attendance_reports(month, year, generated_by, total_employees, total_working_days, total_entries, total_exits, total_missing_exits, total_absences, total_tardiness, total_permissions, total_extra_exits, total_lunch_events, total_outside_company_clockings, total_unknown_ip_clockings, total_security_alerts, total_disciplinary_letters)
  VALUES (
    p_month, p_year, auth.uid(),
    (SELECT count(*) FROM public.profiles WHERE active=true),
    (SELECT count(*) FROM public.daily_attendance_summary WHERE attendance_date BETWEEN v_start AND v_end),
    (SELECT count(*) FROM public.attendance_events WHERE event_date BETWEEN v_start AND v_end AND event_type='ENTRY'),
    (SELECT count(*) FROM public.attendance_events WHERE event_date BETWEEN v_start AND v_end AND event_type='EXIT'),
    (SELECT count(*) FROM public.daily_attendance_summary WHERE attendance_date BETWEEN v_start AND v_end AND missing_exit),
    (SELECT count(*) FROM public.daily_attendance_summary WHERE attendance_date BETWEEN v_start AND v_end AND is_absent),
    (SELECT count(*) FROM public.tardiness_records WHERE month=p_month AND year=p_year),
    (SELECT count(*) FROM public.attendance_events WHERE event_date BETWEEN v_start AND v_end AND event_type IN ('PERMISSION_START','PERMISSION_END')),
    (SELECT count(*) FROM public.attendance_events WHERE event_date BETWEEN v_start AND v_end AND event_type IN ('EXTRA_EXIT_START','EXTRA_EXIT_END')),
    (SELECT count(*) FROM public.attendance_events WHERE event_date BETWEEN v_start AND v_end AND event_type IN ('LUNCH_START','LUNCH_END')),
    (SELECT count(*) FROM public.attendance_events WHERE event_date BETWEEN v_start AND v_end AND connection_location_status='outside_company_network'),
    (SELECT count(*) FROM public.attendance_events WHERE event_date BETWEEN v_start AND v_end AND connection_location_status='unknown'),
    (SELECT count(*) FROM public.alerts WHERE created_at::date BETWEEN v_start AND v_end AND alert_type IN ('outside_company_clocking','unknown_ip_clocking')),
    (SELECT count(*) FROM public.disciplinary_letters WHERE month=p_month AND year=p_year)
  )
  ON CONFLICT(month, year) DO UPDATE SET generated_at=now(), generated_by=auth.uid(), status='generated',
    total_employees=EXCLUDED.total_employees, total_working_days=EXCLUDED.total_working_days, total_entries=EXCLUDED.total_entries,
    total_exits=EXCLUDED.total_exits, total_missing_exits=EXCLUDED.total_missing_exits, total_absences=EXCLUDED.total_absences,
    total_tardiness=EXCLUDED.total_tardiness, total_permissions=EXCLUDED.total_permissions, total_extra_exits=EXCLUDED.total_extra_exits,
    total_lunch_events=EXCLUDED.total_lunch_events, total_outside_company_clockings=EXCLUDED.total_outside_company_clockings,
    total_unknown_ip_clockings=EXCLUDED.total_unknown_ip_clockings, total_security_alerts=EXCLUDED.total_security_alerts,
    total_disciplinary_letters=EXCLUDED.total_disciplinary_letters
  RETURNING id INTO v_report;

  DELETE FROM public.monthly_attendance_report_details WHERE report_id=v_report;
  INSERT INTO public.monthly_attendance_report_details(report_id, employee_id, attendance_date, expected_entry_time, actual_entry_time, expected_exit_time, actual_exit_time, expected_lunch_start_time, expected_lunch_end_time, actual_lunch_start_time, actual_lunch_end_time, lunch_start, lunch_end, permission_start, permission_end, extra_exit_start, extra_exit_end, late_minutes_total, late_minutes_after_tolerance, total_lunch_minutes, lunch_late, lunch_late_minutes, lunch_started_too_early, lunch_early_minutes, lunch_overrun, lunch_overrun_minutes, lunch_status, status, close_status, is_absent, missing_exit, is_justified, ip_address, connection_location_status, security_flag, observations)
  SELECT v_report, employee_id, attendance_date, expected_entry_time, actual_entry_time, expected_exit_time, actual_exit_time, expected_lunch_start_time, expected_lunch_end_time, actual_lunch_start_time, actual_lunch_end_time, lunch_start, lunch_end, permission_start, permission_end, extra_exit_start, extra_exit_end, late_minutes_total, late_minutes_after_tolerance, total_lunch_minutes, lunch_late, lunch_late_minutes, lunch_started_too_early, lunch_early_minutes, lunch_overrun, lunch_overrun_minutes, lunch_status, status, close_status, is_absent, missing_exit, is_justified, ip_address, connection_location_status, security_flag, observations
  FROM public.v_monthly_absolute_attendance_report
  WHERE month=p_month AND year=p_year;
  RETURN v_report;
END $$;

-- Permisos RPC nuevas
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
           FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname IN ('get_active_shift_for_employee','auto_close_daily_shift','generate_monthly_absolute_report','register_entry_on_login','register_attendance_event')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon;', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role;', r.proname, r.args);
  END LOOP;
END $$;

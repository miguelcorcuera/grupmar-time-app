
-- ============================================================
-- GrupMar Time — Esquema completo
-- ============================================================

-- Enum de roles
CREATE TYPE public.app_role AS ENUM ('admin','user');

-- Tabla user_roles (separada de profiles para evitar escalada)
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role (SECURITY DEFINER, evita recursión)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin');
$$;

CREATE POLICY "users view own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "admin manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- Departments / Work Centers
-- ============================================================
CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read departments" ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write departments" ON public.departments FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE public.work_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_centers TO authenticated;
GRANT ALL ON public.work_centers TO service_role;
ALTER TABLE public.work_centers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read centers" ON public.work_centers FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write centers" ON public.work_centers FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- Profiles
-- ============================================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  employee_code text,
  document_number text,
  department_id uuid REFERENCES public.departments(id),
  work_center_id uuid REFERENCES public.work_centers(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_dept ON public.profiles(department_id);
CREATE INDEX idx_profiles_center ON public.profiles(work_center_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "admin manage profiles" ON public.profiles FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- Shifts + Assignments
-- ============================================================
CREATE TABLE public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  lunch_minutes integer NOT NULL DEFAULT 60,
  tolerance_minutes integer NOT NULL DEFAULT 10,
  days_applicable integer[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shifts TO authenticated;
GRANT ALL ON public.shifts TO service_role;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read shifts" ON public.shifts FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write shifts" ON public.shifts FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE public.employee_shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.shifts(id),
  start_date date NOT NULL,
  end_date date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_assign_emp ON public.employee_shift_assignments(employee_id);
CREATE INDEX idx_assign_dates ON public.employee_shift_assignments(start_date, end_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_shift_assignments TO authenticated;
GRANT ALL ON public.employee_shift_assignments TO service_role;
ALTER TABLE public.employee_shift_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view own assign" ON public.employee_shift_assignments FOR SELECT TO authenticated USING (employee_id = auth.uid() OR public.is_admin());
CREATE POLICY "admin write assign" ON public.employee_shift_assignments FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- attendance_events
-- ============================================================
CREATE TABLE public.attendance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('ENTRY','LUNCH_START','LUNCH_END','PERMISSION_START','PERMISSION_END','EXTRA_EXIT_START','EXTRA_EXIT_END','EXIT')),
  event_time timestamptz NOT NULL DEFAULT now(),
  event_date date NOT NULL DEFAULT current_date,
  source text DEFAULT 'web',
  ip_address text,
  user_agent text,
  browser_info text,
  device_info text,
  connection_location_status text CHECK (connection_location_status IN ('company_network','outside_company_network','unknown')),
  is_company_network boolean NOT NULL DEFAULT false,
  security_flag boolean NOT NULL DEFAULT false,
  security_notes text,
  status text NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','pending_review','justified','cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);
CREATE INDEX idx_att_emp_date ON public.attendance_events(employee_id, event_date);
CREATE INDEX idx_att_type ON public.attendance_events(event_type);
CREATE INDEX idx_att_date ON public.attendance_events(event_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_events TO authenticated;
GRANT ALL ON public.attendance_events TO service_role;
ALTER TABLE public.attendance_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view own events" ON public.attendance_events FOR SELECT TO authenticated USING (employee_id = auth.uid() OR public.is_admin());
CREATE POLICY "admin write events" ON public.attendance_events FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
-- Inserciones reales pasan por RPC SECURITY DEFINER, no por INSERT directo del usuario.

-- ============================================================
-- daily_attendance_summary
-- ============================================================
CREATE TABLE public.daily_attendance_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  shift_id uuid REFERENCES public.shifts(id),
  expected_entry_time time,
  actual_entry_time timestamptz,
  expected_exit_time time,
  actual_exit_time timestamptz,
  lunch_start timestamptz,
  lunch_end timestamptz,
  total_lunch_minutes integer DEFAULT 0,
  late_minutes_total integer DEFAULT 0,
  late_minutes_after_tolerance integer DEFAULT 0,
  status text DEFAULT 'pending',
  has_tardiness boolean DEFAULT false,
  has_permission boolean DEFAULT false,
  has_extra_exit boolean DEFAULT false,
  is_absent boolean DEFAULT false,
  is_justified boolean DEFAULT false,
  has_security_flag boolean DEFAULT false,
  connection_location_status text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, attendance_date)
);
CREATE INDEX idx_summary_date ON public.daily_attendance_summary(attendance_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_attendance_summary TO authenticated;
GRANT ALL ON public.daily_attendance_summary TO service_role;
ALTER TABLE public.daily_attendance_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view own summary" ON public.daily_attendance_summary FOR SELECT TO authenticated USING (employee_id = auth.uid() OR public.is_admin());
CREATE POLICY "admin manage summary" ON public.daily_attendance_summary FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- tardiness_records
-- ============================================================
CREATE TABLE public.tardiness_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  expected_time time,
  actual_time timestamptz,
  tolerance_minutes integer DEFAULT 10,
  late_minutes integer DEFAULT 0,
  sanctionable_late_minutes integer DEFAULT 0,
  justified boolean DEFAULT false,
  counts_for_discipline boolean DEFAULT true,
  month integer NOT NULL,
  year integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tard_emp_period ON public.tardiness_records(employee_id, year, month);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tardiness_records TO authenticated;
GRANT ALL ON public.tardiness_records TO service_role;
ALTER TABLE public.tardiness_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view own tard" ON public.tardiness_records FOR SELECT TO authenticated USING (employee_id = auth.uid() OR public.is_admin());
CREATE POLICY "admin manage tard" ON public.tardiness_records FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- alerts
-- ============================================================
CREATE TABLE public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info','warning','critical')),
  title text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','closed','cancelled')),
  threshold integer,
  month integer,
  year integer,
  related_attendance_event_id uuid REFERENCES public.attendance_events(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz
);
CREATE INDEX idx_alerts_status ON public.alerts(status);
CREATE INDEX idx_alerts_emp ON public.alerts(employee_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO authenticated;
GRANT ALL ON public.alerts TO service_role;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin view alerts" ON public.alerts FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "admin manage alerts" ON public.alerts FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- disciplinary_letters
-- ============================================================
CREATE TABLE public.disciplinary_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  letter_type text NOT NULL,
  month integer NOT NULL,
  year integer NOT NULL,
  threshold integer,
  tardiness_count integer DEFAULT 0,
  content text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed','approved','downloaded','cancelled')),
  generated_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  pdf_url text
);
CREATE INDEX idx_letters_emp ON public.disciplinary_letters(employee_id, year, month);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.disciplinary_letters TO authenticated;
GRANT ALL ON public.disciplinary_letters TO service_role;
ALTER TABLE public.disciplinary_letters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin view letters" ON public.disciplinary_letters FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "admin manage letters" ON public.disciplinary_letters FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- justifications
-- ============================================================
CREATE TABLE public.justifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  attendance_event_id uuid REFERENCES public.attendance_events(id),
  tardiness_record_id uuid REFERENCES public.tardiness_records(id),
  justification_type text,
  reason text NOT NULL,
  attachment_url text,
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'approved',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.justifications TO authenticated;
GRANT ALL ON public.justifications TO service_role;
ALTER TABLE public.justifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view own just" ON public.justifications FOR SELECT TO authenticated USING (employee_id = auth.uid() OR public.is_admin());
CREATE POLICY "admin manage just" ON public.justifications FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- audit_logs
-- ============================================================
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text
);
CREATE INDEX idx_audit_table ON public.audit_logs(table_name, record_id);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin view audit" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin());

-- ============================================================
-- security_logs
-- ============================================================
CREATE TABLE public.security_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  attendance_event_id uuid REFERENCES public.attendance_events(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  ip_address text,
  user_agent text,
  browser_info text,
  device_info text,
  is_company_network boolean DEFAULT false,
  connection_location_status text CHECK (connection_location_status IN ('company_network','outside_company_network','unknown','blocked')),
  risk_level text CHECK (risk_level IN ('low','medium','high')),
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sec_emp ON public.security_logs(employee_id);
GRANT SELECT, INSERT ON public.security_logs TO authenticated;
GRANT ALL ON public.security_logs TO service_role;
ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin view sec" ON public.security_logs FOR SELECT TO authenticated USING (public.is_admin());

-- ============================================================
-- system_settings
-- ============================================================
CREATE TABLE public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text UNIQUE NOT NULL,
  setting_value text NOT NULL,
  description text,
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read settings" ON public.system_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write settings" ON public.system_settings FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.system_settings (setting_key, setting_value, description) VALUES
('default_tolerance_minutes','10','Tolerancia por defecto en minutos'),
('tardiness_alert_threshold','5','Tardanzas para generar alerta + carta'),
('critical_warning_after_letters','3','Cartas para alerta crítica'),
('allowed_company_ip','80.24.218.227','IP pública oficial de la empresa'),
('allow_outside_company_clocking','true','Permitir marcar fuera de oficina'),
('flag_outside_company_clocking','true','Marcar como sospechosa cuando es fuera'),
('require_security_review_for_outside_ip','true','Crear alerta de seguridad'),
('allow_geolocation','false','Capturar geolocalización'),
('allow_manual_attendance_edit','false','Permitir edición manual'),
('require_admin_reason_on_edit','true','Exigir razón en edición admin');

-- ============================================================
-- RPC: get_setting
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_setting(p_key text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT setting_value FROM public.system_settings WHERE setting_key = p_key;
$$;

-- ============================================================
-- RPC: calculate_tardiness
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculate_tardiness(p_employee uuid, p_date date)
RETURNS TABLE (
  expected_time time, actual_time timestamptz, tolerance_minutes integer,
  late_minutes_total integer, late_minutes_after_tolerance integer, is_late boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_shift_start time; v_tol integer; v_entry timestamptz; v_diff integer;
BEGIN
  SELECT s.start_time, s.tolerance_minutes INTO v_shift_start, v_tol
  FROM public.employee_shift_assignments a
  JOIN public.shifts s ON s.id = a.shift_id
  WHERE a.employee_id = p_employee AND a.active = true
    AND a.start_date <= p_date AND (a.end_date IS NULL OR a.end_date >= p_date)
  ORDER BY a.start_date DESC LIMIT 1;

  IF v_shift_start IS NULL THEN RETURN; END IF;

  SELECT event_time INTO v_entry FROM public.attendance_events
  WHERE employee_id = p_employee AND event_date = p_date AND event_type = 'ENTRY'
  ORDER BY event_time ASC LIMIT 1;

  IF v_entry IS NULL THEN
    expected_time := v_shift_start; actual_time := NULL; tolerance_minutes := v_tol;
    late_minutes_total := 0; late_minutes_after_tolerance := 0; is_late := false;
    RETURN NEXT; RETURN;
  END IF;

  v_diff := GREATEST(0, EXTRACT(EPOCH FROM (v_entry AT TIME ZONE 'UTC')::time - v_shift_start)::integer / 60);
  -- usar el tiempo local del servidor (timestamptz menos start_time en mismo día)
  v_diff := GREATEST(0, EXTRACT(EPOCH FROM (v_entry - (p_date::timestamp + v_shift_start)))::integer / 60);

  expected_time := v_shift_start;
  actual_time := v_entry;
  tolerance_minutes := v_tol;
  late_minutes_total := v_diff;
  late_minutes_after_tolerance := GREATEST(0, v_diff - v_tol);
  is_late := v_diff > v_tol;
  RETURN NEXT;
END $$;

-- ============================================================
-- RPC: check_monthly_tardiness_alerts
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_monthly_tardiness_alerts(p_employee uuid, p_month integer, p_year integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count integer; v_threshold integer; v_critical integer;
  v_step integer := 5; v_t integer; v_full_name text;
BEGIN
  SELECT count(*) INTO v_count FROM public.tardiness_records
  WHERE employee_id = p_employee AND month = p_month AND year = p_year
    AND counts_for_discipline = true AND justified = false;

  SELECT full_name INTO v_full_name FROM public.profiles WHERE id = p_employee;
  v_threshold := COALESCE(public.get_setting('tardiness_alert_threshold')::int, 5);
  v_critical := COALESCE(public.get_setting('critical_warning_after_letters')::int, 3);

  v_t := v_threshold;
  WHILE v_t <= v_count LOOP
    IF NOT EXISTS (SELECT 1 FROM public.alerts
      WHERE employee_id = p_employee AND alert_type = 'monthly_tardiness'
        AND month = p_month AND year = p_year AND threshold = v_t)
    THEN
      INSERT INTO public.alerts(employee_id, alert_type, severity, title, message, threshold, month, year)
      VALUES (
        p_employee, 'monthly_tardiness',
        CASE WHEN (v_t / v_threshold) >= v_critical THEN 'critical'
             WHEN (v_t / v_threshold) >= 2 THEN 'warning' ELSE 'info' END,
        format('Tardanzas acumuladas: %s', v_t),
        format('El trabajador %s acumula %s tardanzas en %s/%s.', v_full_name, v_t, p_month, p_year),
        v_t, p_month, p_year
      );
      PERFORM public.generate_disciplinary_letter(p_employee, p_month, p_year, v_t);
    END IF;
    v_t := v_t + v_threshold;
  END LOOP;
END $$;

-- ============================================================
-- RPC: generate_disciplinary_letter
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_disciplinary_letter(p_employee uuid, p_month integer, p_year integer, p_threshold integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid; v_name text; v_doc text; v_count integer; v_detail text;
  v_letters_count integer; v_critical integer; v_threshold_base integer;
  v_type text; v_content text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.disciplinary_letters
    WHERE employee_id = p_employee AND month = p_month AND year = p_year AND threshold = p_threshold)
  THEN RETURN NULL; END IF;

  SELECT full_name, COALESCE(document_number,'(s/d)') INTO v_name, v_doc FROM public.profiles WHERE id = p_employee;
  SELECT count(*) INTO v_count FROM public.tardiness_records
    WHERE employee_id = p_employee AND month = p_month AND year = p_year AND counts_for_discipline = true AND justified = false;

  SELECT string_agg(format('- %s: real %s vs esperada %s', attendance_date, to_char(actual_time,'HH24:MI'), to_char(expected_time,'HH24:MI')), E'\n')
    INTO v_detail
  FROM public.tardiness_records
  WHERE employee_id = p_employee AND month = p_month AND year = p_year AND counts_for_discipline = true AND justified = false;

  v_threshold_base := COALESCE(public.get_setting('tardiness_alert_threshold')::int, 5);
  v_critical := COALESCE(public.get_setting('critical_warning_after_letters')::int, 3);
  SELECT count(*) INTO v_letters_count FROM public.disciplinary_letters
    WHERE employee_id = p_employee AND month = p_month AND year = p_year;

  v_type := CASE
    WHEN (p_threshold / v_threshold_base) >= v_critical THEN 'preaviso'
    WHEN v_letters_count >= 1 THEN 'reincidencia'
    ELSE 'amonestacion' END;

  v_content := format(
'Por medio de la presente, se deja constancia de que el trabajador %s, identificado con documento %s, ha registrado %s tardanzas durante el periodo correspondiente a %s/%s.

Las tardanzas registradas corresponden a las siguientes fechas y horarios:
%s

Se recuerda al trabajador la obligación de cumplir con el horario laboral asignado y registrar correctamente su jornada. La reiteración de estas incidencias podrá dar lugar a nuevas medidas disciplinarias conforme a la normativa interna de la empresa y la legislación laboral aplicable.

Esta comunicación se emite como advertencia formal y queda registrada para efectos internos de seguimiento.',
    v_name, v_doc, v_count, p_month, p_year, COALESCE(v_detail,'(sin detalle)'));

  INSERT INTO public.disciplinary_letters(employee_id, letter_type, month, year, threshold, tardiness_count, content)
  VALUES (p_employee, v_type, p_month, p_year, p_threshold, v_count, v_content)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ============================================================
-- RPC: create_security_alert_if_needed
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_security_alert_if_needed(
  p_employee uuid, p_event_id uuid, p_ip text, p_status text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_name text;
BEGIN
  SELECT full_name INTO v_name FROM public.profiles WHERE id = p_employee;
  IF p_status = 'outside_company_network' THEN
    INSERT INTO public.alerts(employee_id, alert_type, severity, title, message, related_attendance_event_id)
    VALUES (p_employee, 'outside_company_clocking', 'warning',
      'Marcación fuera de la red de empresa',
      format('El trabajador %s registró una marcación fuera de la red oficial. IP detectada: %s. IP autorizada: %s.',
        v_name, COALESCE(p_ip,'?'), public.get_setting('allowed_company_ip')),
      p_event_id);
  ELSIF p_status = 'unknown' THEN
    INSERT INTO public.alerts(employee_id, alert_type, severity, title, message, related_attendance_event_id)
    VALUES (p_employee, 'unknown_ip_clocking', 'warning',
      'IP no detectada en marcación',
      format('El trabajador %s registró una marcación donde no se pudo detectar la IP pública. Requiere revisión.', v_name),
      p_event_id);
  END IF;
END $$;

-- ============================================================
-- RPC: register_entry_on_login
-- ============================================================
CREATE OR REPLACE FUNCTION public.register_entry_on_login(
  client_ip text, p_user_agent text, p_browser text DEFAULT NULL, p_device text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid(); v_profile public.profiles; v_event_id uuid;
  v_allowed_ip text; v_is_company boolean; v_loc text; v_allow_outside boolean;
  v_existing uuid; v_shift public.shifts; v_assign public.employee_shift_assignments;
  v_today date := current_date; v_now timestamptz := now();
  v_late integer := 0; v_late_after integer := 0; v_is_late boolean := false;
  v_expected time; v_blocked boolean := false; v_message text;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','no_session'); END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;
  IF v_profile.id IS NULL OR v_profile.active = false THEN
    RETURN jsonb_build_object('error','profile_inactive');
  END IF;

  v_allowed_ip := public.get_setting('allowed_company_ip');
  v_allow_outside := COALESCE(public.get_setting('allow_outside_company_clocking')='true', true);
  v_is_company := (client_ip IS NOT NULL AND client_ip = v_allowed_ip);
  v_loc := CASE
    WHEN client_ip IS NULL OR client_ip = '' THEN 'unknown'
    WHEN v_is_company THEN 'company_network'
    ELSE 'outside_company_network' END;

  IF v_loc <> 'company_network' AND v_allow_outside = false THEN
    v_blocked := true;
    INSERT INTO public.security_logs(employee_id, event_type, ip_address, user_agent, browser_info, device_info,
      is_company_network, connection_location_status, risk_level, message)
    VALUES (v_uid, 'blocked_entry_attempt', client_ip, p_user_agent, p_browser, p_device,
      false, 'blocked', 'high', 'Intento de marcación bloqueado por IP no autorizada.');
    RETURN jsonb_build_object('blocked', true,
      'message','No se puede registrar la marcación porque no está conectado desde la red autorizada de la empresa.');
  END IF;

  -- ¿ya marcó entrada hoy?
  SELECT id INTO v_existing FROM public.attendance_events
   WHERE employee_id = v_uid AND event_date = v_today AND event_type = 'ENTRY'
   ORDER BY event_time ASC LIMIT 1;

  IF v_existing IS NULL THEN
    INSERT INTO public.attendance_events(employee_id, event_type, event_time, event_date, source,
      ip_address, user_agent, browser_info, device_info, connection_location_status,
      is_company_network, security_flag, created_by)
    VALUES (v_uid, 'ENTRY', v_now, v_today, 'login',
      client_ip, p_user_agent, p_browser, p_device, v_loc,
      v_is_company, NOT v_is_company, v_uid)
    RETURNING id INTO v_event_id;
  ELSE
    v_event_id := v_existing;
  END IF;

  -- turno activo
  SELECT a.* INTO v_assign FROM public.employee_shift_assignments a
   WHERE a.employee_id = v_uid AND a.active = true
     AND a.start_date <= v_today AND (a.end_date IS NULL OR a.end_date >= v_today)
   ORDER BY a.start_date DESC LIMIT 1;
  IF v_assign.id IS NOT NULL THEN
    SELECT * INTO v_shift FROM public.shifts WHERE id = v_assign.shift_id;
    v_expected := v_shift.start_time;
    v_late := GREATEST(0, EXTRACT(EPOCH FROM (v_now - (v_today::timestamp + v_shift.start_time)))::int / 60);
    v_late_after := GREATEST(0, v_late - v_shift.tolerance_minutes);
    v_is_late := v_late > v_shift.tolerance_minutes;
  END IF;

  v_message := CASE
    WHEN v_is_late THEN format('Usted ha llegado tarde. Tardanza calculada: %s minutos fuera de tolerancia.', v_late_after)
    ELSE 'A tiempo' END;

  RETURN jsonb_build_object(
    'event_id', v_event_id, 'full_name', v_profile.full_name,
    'event_time', v_now, 'expected_time', v_expected,
    'is_late', v_is_late, 'late_minutes_total', v_late, 'late_minutes_after_tolerance', v_late_after,
    'ip_address', client_ip, 'is_company_network', v_is_company,
    'connection_location_status', v_loc, 'security_flag', NOT v_is_company,
    'message', v_message
  );
END $$;

-- ============================================================
-- RPC: register_attendance_event
-- ============================================================
CREATE OR REPLACE FUNCTION public.register_attendance_event(
  p_event_type text, p_notes text DEFAULT NULL,
  client_ip text DEFAULT NULL, p_user_agent text DEFAULT NULL,
  p_browser text DEFAULT NULL, p_device text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid(); v_profile public.profiles; v_event_id uuid;
  v_today date := current_date; v_now timestamptz := now();
  v_allowed_ip text; v_is_company boolean; v_loc text; v_allow_outside boolean;
  v_has_open_lunch boolean; v_has_open_perm boolean; v_has_open_extra boolean;
  v_has_entry boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','no_session'); END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;
  IF v_profile.id IS NULL OR v_profile.active = false THEN RETURN jsonb_build_object('error','profile_inactive'); END IF;
  IF p_event_type NOT IN ('LUNCH_START','LUNCH_END','PERMISSION_START','PERMISSION_END','EXTRA_EXIT_START','EXTRA_EXIT_END','EXIT')
    THEN RETURN jsonb_build_object('error','invalid_event_type'); END IF;

  v_allowed_ip := public.get_setting('allowed_company_ip');
  v_allow_outside := COALESCE(public.get_setting('allow_outside_company_clocking')='true', true);
  v_is_company := (client_ip IS NOT NULL AND client_ip = v_allowed_ip);
  v_loc := CASE WHEN client_ip IS NULL OR client_ip = '' THEN 'unknown'
                WHEN v_is_company THEN 'company_network' ELSE 'outside_company_network' END;

  IF v_loc <> 'company_network' AND v_allow_outside = false THEN
    INSERT INTO public.security_logs(employee_id, event_type, ip_address, user_agent, browser_info, device_info,
      is_company_network, connection_location_status, risk_level, message)
    VALUES (v_uid, 'blocked_'||p_event_type, client_ip, p_user_agent, p_browser, p_device,
      false, 'blocked', 'high', 'Intento bloqueado por IP no autorizada.');
    RETURN jsonb_build_object('blocked', true,
      'message','No se puede registrar la marcación porque no está conectado desde la red autorizada de la empresa.');
  END IF;

  -- validaciones de estado
  SELECT EXISTS(SELECT 1 FROM public.attendance_events WHERE employee_id=v_uid AND event_date=v_today AND event_type='ENTRY') INTO v_has_entry;
  IF NOT v_has_entry THEN RETURN jsonb_build_object('error','no_entry_today'); END IF;

  v_has_open_lunch := EXISTS(
    SELECT 1 FROM public.attendance_events e WHERE e.employee_id=v_uid AND e.event_date=v_today AND e.event_type='LUNCH_START'
    AND NOT EXISTS (SELECT 1 FROM public.attendance_events e2 WHERE e2.employee_id=v_uid AND e2.event_date=v_today
      AND e2.event_type='LUNCH_END' AND e2.event_time > e.event_time));
  v_has_open_perm := EXISTS(
    SELECT 1 FROM public.attendance_events e WHERE e.employee_id=v_uid AND e.event_date=v_today AND e.event_type='PERMISSION_START'
    AND NOT EXISTS (SELECT 1 FROM public.attendance_events e2 WHERE e2.employee_id=v_uid AND e2.event_date=v_today
      AND e2.event_type='PERMISSION_END' AND e2.event_time > e.event_time));
  v_has_open_extra := EXISTS(
    SELECT 1 FROM public.attendance_events e WHERE e.employee_id=v_uid AND e.event_date=v_today AND e.event_type='EXTRA_EXIT_START'
    AND NOT EXISTS (SELECT 1 FROM public.attendance_events e2 WHERE e2.employee_id=v_uid AND e2.event_date=v_today
      AND e2.event_type='EXTRA_EXIT_END' AND e2.event_time > e.event_time));

  IF p_event_type='LUNCH_START' AND v_has_open_lunch THEN RETURN jsonb_build_object('error','lunch_already_open'); END IF;
  IF p_event_type='LUNCH_END' AND NOT v_has_open_lunch THEN RETURN jsonb_build_object('error','no_open_lunch'); END IF;
  IF p_event_type='PERMISSION_END' AND NOT v_has_open_perm THEN RETURN jsonb_build_object('error','no_open_permission'); END IF;
  IF p_event_type='EXTRA_EXIT_END' AND NOT v_has_open_extra THEN RETURN jsonb_build_object('error','no_open_extra_exit'); END IF;
  IF p_event_type='PERMISSION_START' AND v_has_open_perm THEN RETURN jsonb_build_object('error','permission_already_open'); END IF;
  IF p_event_type='EXTRA_EXIT_START' AND v_has_open_extra THEN RETURN jsonb_build_object('error','extra_exit_already_open'); END IF;
  IF p_event_type='EXIT' AND (v_has_open_lunch OR v_has_open_perm OR v_has_open_extra) THEN
    RETURN jsonb_build_object('error','open_event_blocks_exit'); END IF;
  IF p_event_type='EXIT' AND EXISTS(SELECT 1 FROM public.attendance_events WHERE employee_id=v_uid AND event_date=v_today AND event_type='EXIT')
    THEN RETURN jsonb_build_object('error','exit_already_registered'); END IF;

  INSERT INTO public.attendance_events(employee_id, event_type, event_time, event_date, source,
    ip_address, user_agent, browser_info, device_info, connection_location_status,
    is_company_network, security_flag, notes, created_by)
  VALUES (v_uid, p_event_type, v_now, v_today, 'web',
    client_ip, p_user_agent, p_browser, p_device, v_loc,
    v_is_company, NOT v_is_company, p_notes, v_uid)
  RETURNING id INTO v_event_id;

  RETURN jsonb_build_object('event_id', v_event_id, 'event_type', p_event_type, 'event_time', v_now,
    'connection_location_status', v_loc, 'is_company_network', v_is_company);
END $$;

-- ============================================================
-- RPC: justify_tardiness (admin)
-- ============================================================
CREATE OR REPLACE FUNCTION public.justify_tardiness(p_tardiness uuid, p_type text, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_emp uuid;
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('error','forbidden'); END IF;
  SELECT employee_id INTO v_emp FROM public.tardiness_records WHERE id = p_tardiness;
  IF v_emp IS NULL THEN RETURN jsonb_build_object('error','not_found'); END IF;
  UPDATE public.tardiness_records SET justified = true, counts_for_discipline = false WHERE id = p_tardiness;
  INSERT INTO public.justifications(employee_id, tardiness_record_id, justification_type, reason, approved_by)
  VALUES (v_emp, p_tardiness, p_type, p_reason, auth.uid());
  INSERT INTO public.audit_logs(table_name, record_id, action, new_value, changed_by, reason)
  VALUES ('tardiness_records', p_tardiness, 'JUSTIFY', jsonb_build_object('type',p_type,'reason',p_reason), auth.uid(), p_reason);
  RETURN jsonb_build_object('ok', true);
END $$;

-- ============================================================
-- RPC: detect_daily_absences
-- ============================================================
CREATE OR REPLACE FUNCTION public.detect_daily_absences(p_date date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count integer := 0; r record;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  FOR r IN
    SELECT p.id, a.shift_id, s.start_time, s.end_time
    FROM public.profiles p
    JOIN public.employee_shift_assignments a ON a.employee_id = p.id AND a.active = true
       AND a.start_date <= p_date AND (a.end_date IS NULL OR a.end_date >= p_date)
    JOIN public.shifts s ON s.id = a.shift_id
    WHERE p.active = true
      AND NOT EXISTS (SELECT 1 FROM public.attendance_events e WHERE e.employee_id = p.id AND e.event_date = p_date AND e.event_type='ENTRY')
  LOOP
    INSERT INTO public.daily_attendance_summary(employee_id, attendance_date, shift_id, expected_entry_time, expected_exit_time, status, is_absent)
    VALUES (r.id, p_date, r.shift_id, r.start_time, r.end_time, 'absent', true)
    ON CONFLICT (employee_id, attendance_date) DO UPDATE SET is_absent = true, status='absent';
    INSERT INTO public.alerts(employee_id, alert_type, severity, title, message)
    VALUES (r.id, 'absence', 'warning', 'Ausencia detectada', format('Trabajador sin marcación de entrada el %s.', p_date));
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;

-- ============================================================
-- Trigger: attendance_events_after_insert -> summary, tardiness, alerts
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_attendance_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_assign public.employee_shift_assignments; v_shift public.shifts;
  v_late integer; v_late_after integer; v_lunch_minutes integer := 0;
BEGIN
  SELECT a.* INTO v_assign FROM public.employee_shift_assignments a
    WHERE a.employee_id = NEW.employee_id AND a.active = true
      AND a.start_date <= NEW.event_date AND (a.end_date IS NULL OR a.end_date >= NEW.event_date)
    ORDER BY a.start_date DESC LIMIT 1;
  IF v_assign.id IS NOT NULL THEN
    SELECT * INTO v_shift FROM public.shifts WHERE id = v_assign.shift_id;
  END IF;

  INSERT INTO public.daily_attendance_summary(employee_id, attendance_date, shift_id, expected_entry_time, expected_exit_time, status)
    VALUES (NEW.employee_id, NEW.event_date, v_assign.shift_id, v_shift.start_time, v_shift.end_time, 'pending')
    ON CONFLICT (employee_id, attendance_date) DO NOTHING;

  IF NEW.event_type = 'ENTRY' THEN
    IF v_shift.id IS NOT NULL THEN
      v_late := GREATEST(0, EXTRACT(EPOCH FROM (NEW.event_time - (NEW.event_date::timestamp + v_shift.start_time)))::int / 60);
      v_late_after := GREATEST(0, v_late - v_shift.tolerance_minutes);
      UPDATE public.daily_attendance_summary SET
        actual_entry_time = NEW.event_time, late_minutes_total = v_late,
        late_minutes_after_tolerance = v_late_after,
        has_tardiness = (v_late_after > 0),
        status = CASE WHEN v_late_after > 0 THEN 'late' ELSE 'on_time' END,
        has_security_flag = NEW.security_flag,
        connection_location_status = NEW.connection_location_status,
        ip_address = NEW.ip_address,
        updated_at = now()
      WHERE employee_id = NEW.employee_id AND attendance_date = NEW.event_date;

      IF v_late_after > 0 THEN
        INSERT INTO public.tardiness_records(employee_id, attendance_date, expected_time, actual_time,
          tolerance_minutes, late_minutes, sanctionable_late_minutes, month, year)
        VALUES (NEW.employee_id, NEW.event_date, v_shift.start_time, NEW.event_time,
          v_shift.tolerance_minutes, v_late, v_late_after,
          EXTRACT(MONTH FROM NEW.event_date)::int, EXTRACT(YEAR FROM NEW.event_date)::int);
      END IF;
    END IF;
  ELSIF NEW.event_type='LUNCH_START' THEN
    UPDATE public.daily_attendance_summary SET lunch_start = NEW.event_time, updated_at=now()
      WHERE employee_id=NEW.employee_id AND attendance_date=NEW.event_date;
  ELSIF NEW.event_type='LUNCH_END' THEN
    UPDATE public.daily_attendance_summary SET lunch_end = NEW.event_time,
      total_lunch_minutes = COALESCE(EXTRACT(EPOCH FROM (NEW.event_time - lunch_start))::int / 60, 0),
      updated_at=now()
      WHERE employee_id=NEW.employee_id AND attendance_date=NEW.event_date;
  ELSIF NEW.event_type IN ('PERMISSION_START','PERMISSION_END') THEN
    UPDATE public.daily_attendance_summary SET has_permission = true, updated_at=now()
      WHERE employee_id=NEW.employee_id AND attendance_date=NEW.event_date;
  ELSIF NEW.event_type IN ('EXTRA_EXIT_START','EXTRA_EXIT_END') THEN
    UPDATE public.daily_attendance_summary SET has_extra_exit = true, updated_at=now()
      WHERE employee_id=NEW.employee_id AND attendance_date=NEW.event_date;
  ELSIF NEW.event_type='EXIT' THEN
    UPDATE public.daily_attendance_summary SET actual_exit_time = NEW.event_time, updated_at=now()
      WHERE employee_id=NEW.employee_id AND attendance_date=NEW.event_date;
  END IF;

  IF NEW.security_flag THEN
    INSERT INTO public.security_logs(employee_id, attendance_event_id, event_type, ip_address, user_agent,
      browser_info, device_info, is_company_network, connection_location_status, risk_level, message)
    VALUES (NEW.employee_id, NEW.id, 'flagged_'||NEW.event_type, NEW.ip_address, NEW.user_agent,
      NEW.browser_info, NEW.device_info, NEW.is_company_network, NEW.connection_location_status,
      CASE WHEN NEW.connection_location_status='unknown' THEN 'medium' ELSE 'medium' END,
      'Marcación con bandera de seguridad.');
    PERFORM public.create_security_alert_if_needed(NEW.employee_id, NEW.id, NEW.ip_address, NEW.connection_location_status);
  END IF;

  RETURN NEW;
END $$;
CREATE TRIGGER trg_attendance_after_insert AFTER INSERT ON public.attendance_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_attendance_after_insert();

-- Trigger en tardiness -> chequear alertas mensuales
CREATE OR REPLACE FUNCTION public.fn_tardiness_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.check_monthly_tardiness_alerts(NEW.employee_id, NEW.month, NEW.year);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_tardiness_after_insert AFTER INSERT ON public.tardiness_records
  FOR EACH ROW EXECUTE FUNCTION public.fn_tardiness_after_insert();

-- Trigger genérico de auditoría
CREATE OR REPLACE FUNCTION public.fn_audit_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs(table_name, record_id, action, old_value, new_value, changed_by)
  VALUES (TG_TABLE_NAME,
    COALESCE((NEW).id, (OLD).id),
    TG_OP,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END,
    auth.uid());
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER trg_audit_profiles AFTER INSERT OR UPDATE OR DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();
CREATE TRIGGER trg_audit_shifts AFTER INSERT OR UPDATE OR DELETE ON public.shifts FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();
CREATE TRIGGER trg_audit_assign AFTER INSERT OR UPDATE OR DELETE ON public.employee_shift_assignments FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();
CREATE TRIGGER trg_audit_settings AFTER INSERT OR UPDATE OR DELETE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();
CREATE TRIGGER trg_audit_letters AFTER UPDATE OR DELETE ON public.disciplinary_letters FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();
CREATE TRIGGER trg_audit_just AFTER INSERT OR UPDATE OR DELETE ON public.justifications FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

-- ============================================================
-- VIEWS
-- ============================================================
CREATE OR REPLACE VIEW public.v_daily_attendance_admin AS
SELECT s.employee_id, p.full_name, d.name AS department, w.name AS work_center,
  sh.name AS shift, s.attendance_date, s.expected_entry_time, s.actual_entry_time,
  s.expected_exit_time, s.actual_exit_time, s.status, s.has_tardiness,
  s.late_minutes_total, s.late_minutes_after_tolerance, s.lunch_start, s.lunch_end,
  s.total_lunch_minutes, s.has_permission, s.has_extra_exit, s.is_absent, s.is_justified,
  s.ip_address, (s.connection_location_status='company_network') AS is_company_network,
  s.connection_location_status, s.has_security_flag AS security_flag
FROM public.daily_attendance_summary s
JOIN public.profiles p ON p.id = s.employee_id
LEFT JOIN public.departments d ON d.id = p.department_id
LEFT JOIN public.work_centers w ON w.id = p.work_center_id
LEFT JOIN public.shifts sh ON sh.id = s.shift_id;
GRANT SELECT ON public.v_daily_attendance_admin TO authenticated;

CREATE OR REPLACE VIEW public.v_monthly_tardiness_summary AS
SELECT t.employee_id, p.full_name, t.month, t.year,
  count(*) AS total_tardiness,
  count(*) FILTER (WHERE t.justified) AS justified_tardiness,
  count(*) FILTER (WHERE t.counts_for_discipline AND NOT t.justified) AS sanctionable_tardiness,
  COALESCE(sum(t.sanctionable_late_minutes),0) AS accumulated_late_minutes,
  (SELECT count(*) FROM public.disciplinary_letters l
    WHERE l.employee_id=t.employee_id AND l.month=t.month AND l.year=t.year) AS generated_letters_count,
  CASE
    WHEN count(*) FILTER (WHERE t.counts_for_discipline AND NOT t.justified) >= 15 THEN 'critical'
    WHEN count(*) FILTER (WHERE t.counts_for_discipline AND NOT t.justified) >= 10 THEN 'warning'
    WHEN count(*) FILTER (WHERE t.counts_for_discipline AND NOT t.justified) >= 5 THEN 'info'
    ELSE 'ok' END AS alert_level
FROM public.tardiness_records t JOIN public.profiles p ON p.id = t.employee_id
GROUP BY t.employee_id, p.full_name, t.month, t.year;
GRANT SELECT ON public.v_monthly_tardiness_summary TO authenticated;

CREATE OR REPLACE VIEW public.v_employee_attendance_stats AS
SELECT p.id AS employee_id, p.full_name,
  (SELECT count(*) FROM public.daily_attendance_summary d WHERE d.employee_id=p.id AND NOT d.is_absent) AS total_worked_days,
  (SELECT count(*) FROM public.daily_attendance_summary d WHERE d.employee_id=p.id AND d.is_absent) AS total_absences,
  (SELECT count(*) FROM public.tardiness_records t WHERE t.employee_id=p.id) AS total_tardiness,
  (SELECT count(*) FROM public.attendance_events e WHERE e.employee_id=p.id AND e.event_type='PERMISSION_START') AS total_permissions,
  (SELECT count(*) FROM public.attendance_events e WHERE e.employee_id=p.id AND e.event_type='EXTRA_EXIT_START') AS total_extra_exits,
  (SELECT to_char(avg(extract(epoch FROM e.event_time::time)) * interval '1 second', 'HH24:MI')
     FROM public.attendance_events e WHERE e.employee_id=p.id AND e.event_type='ENTRY') AS average_entry_time,
  (SELECT COALESCE(sum(sanctionable_late_minutes),0) FROM public.tardiness_records t WHERE t.employee_id=p.id) AS accumulated_late_minutes,
  (SELECT count(*) FROM public.tardiness_records t WHERE t.employee_id=p.id
    AND t.month=EXTRACT(MONTH FROM current_date)::int AND t.year=EXTRACT(YEAR FROM current_date)::int) AS current_month_tardiness,
  (SELECT count(*) FROM public.attendance_events e WHERE e.employee_id=p.id AND e.connection_location_status='outside_company_network') AS total_outside_company_clockings,
  (SELECT count(*) FROM public.attendance_events e WHERE e.employee_id=p.id AND e.connection_location_status='unknown') AS total_unknown_ip_clockings
FROM public.profiles p;
GRANT SELECT ON public.v_employee_attendance_stats TO authenticated;

CREATE OR REPLACE VIEW public.v_security_clocking_summary AS
SELECT p.id AS employee_id, p.full_name,
  (SELECT count(*) FROM public.attendance_events e WHERE e.employee_id=p.id) AS total_clockings,
  (SELECT count(*) FROM public.attendance_events e WHERE e.employee_id=p.id AND e.connection_location_status='company_network') AS company_network_clockings,
  (SELECT count(*) FROM public.attendance_events e WHERE e.employee_id=p.id AND e.connection_location_status='outside_company_network') AS outside_company_clockings,
  (SELECT count(*) FROM public.attendance_events e WHERE e.employee_id=p.id AND e.connection_location_status='unknown') AS unknown_ip_clockings,
  (SELECT e.ip_address FROM public.attendance_events e WHERE e.employee_id=p.id ORDER BY e.event_time DESC LIMIT 1) AS last_ip_address,
  (SELECT e.connection_location_status FROM public.attendance_events e WHERE e.employee_id=p.id ORDER BY e.event_time DESC LIMIT 1) AS last_connection_location_status,
  (SELECT max(e.event_time) FROM public.attendance_events e WHERE e.employee_id=p.id) AS last_clocking_at
FROM public.profiles p;
GRANT SELECT ON public.v_security_clocking_summary TO authenticated;

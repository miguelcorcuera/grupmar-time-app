
ALTER VIEW public.v_daily_attendance_admin SET (security_invoker = true);
ALTER VIEW public.v_monthly_tardiness_summary SET (security_invoker = true);
ALTER VIEW public.v_employee_attendance_stats SET (security_invoker = true);
ALTER VIEW public.v_security_clocking_summary SET (security_invoker = true);

-- Revocar ejecución de anon en RPCs sensibles; permitir solo a authenticated
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
           FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname IN (
             'has_role','is_admin','get_setting','calculate_tardiness',
             'check_monthly_tardiness_alerts','generate_disciplinary_letter',
             'create_security_alert_if_needed','register_entry_on_login',
             'register_attendance_event','justify_tardiness','detect_daily_absences'
           )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon;', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role;', r.proname, r.args);
  END LOOP;
END $$;

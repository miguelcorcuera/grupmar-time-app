
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS lunch_start_time time,
  ADD COLUMN IF NOT EXISTS lunch_end_time time,
  ADD COLUMN IF NOT EXISTS max_lunch_minutes integer DEFAULT 60,
  ADD COLUMN IF NOT EXISTS exit_grace_minutes integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS early_clockin_window_minutes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS allow_early_clockin_without_approval boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_overtime_without_approval boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_admin_approval_for_overtime boolean DEFAULT true;

ALTER TABLE public.attendance_events
  ADD COLUMN IF NOT EXISTS requires_admin_review boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS lunch_window_status text;

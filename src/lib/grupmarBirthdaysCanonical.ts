import { supabase } from "@/integrations/supabase/client";

export type CanonicalBirthday = {
  profile_id: string;
  full_name: string | null;
  email: string | null;
  birth_date: string;
  mm_dd: string;
  department: string | null;
  work_center: string | null;
  company_name: string | null;
  days_until?: number;
};

export async function getCanonicalBirthdaysToday(referenceDate?: string) {
  const ref = referenceDate || new Date().toISOString().slice(0, 10);

  const { data, error } = await (supabase as any).rpc("gmt_birthdays_today", {
    p_ref_date: ref,
  });

  if (error) throw error;
  return (data || []) as CanonicalBirthday[];
}

export async function getCanonicalBirthdaysUpcoming(days = 30, referenceDate?: string) {
  const ref = referenceDate || new Date().toISOString().slice(0, 10);

  const { data, error } = await (supabase as any).rpc("gmt_birthdays_upcoming", {
    p_days: days,
    p_ref_date: ref,
  });

  if (error) throw error;
  return (data || []) as CanonicalBirthday[];
}

export function isBirthdayTodayFromBirthDate(birthDate?: string | null, referenceDate?: string) {
  if (!birthDate) return false;
  const ref = referenceDate || new Date().toISOString().slice(0, 10);
  return String(birthDate).slice(5, 10) === String(ref).slice(5, 10);
}

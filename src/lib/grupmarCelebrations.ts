import { supabase } from "@/integrations/supabase/client";

export type CanonicalBirthday = {
  profile_id?: string;
  id?: string;
  full_name?: string | null;
  email?: string | null;
  birth_date?: string | null;
  mm_dd?: string | null;
  department?: string | null;
  work_center?: string | null;
  company_name?: string | null;
  days_until?: number;
};

export type GrupmarCelebrationConfig = {
  birthdays: CanonicalBirthday[];
  holidays: any[];
  saints: any[];
  nameDays: any[];
  source: {
    birthdays: "public.profiles.birth_date";
    holidays: "public.company_holidays";
    saints: "public.saints_calendar";
  };
};

export const EMPTY_CANONICAL_CELEBRATION_CONFIG: GrupmarCelebrationConfig = {
  birthdays: [],
  holidays: [],
  saints: [],
  nameDays: [],
  source: {
    birthdays: "public.profiles.birth_date",
    holidays: "public.company_holidays",
    saints: "public.saints_calendar",
  },
};

function todayISO() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : new Date().toISOString().slice(0, 10);
}

function mmddFromDateLike(value: any) {
  const raw = String(value || "").trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(5, 10);
  if (/^\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{2}\/\d{2}/.test(raw)) {
    const [dd, mm] = raw.split("/");
    return `${mm}-${dd}`;
  }

  return "";
}

function todayMMDD() {
  return todayISO().slice(5, 10);
}

function normalizeText(value: any) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

function firstNameOf(profile: any) {
  return String(
    profile?.first_names ||
      profile?.firstName ||
      profile?.full_name ||
      profile?.display_name ||
      profile?.name ||
      profile?.email ||
      ""
  )
    .trim()
    .split(/\s+/)[0];
}

/**
 * Fachada legacy SINCRONA.
 * No lee localStorage. Devuelve estructura vacía estable para que la home
 * de cualquier empleado no reviente al renderizar.
 */
export function readCelebrationConfig(): GrupmarCelebrationConfig {
  return EMPTY_CANONICAL_CELEBRATION_CONFIG;
}

export function loadCelebrationConfig(): GrupmarCelebrationConfig {
  return EMPTY_CANONICAL_CELEBRATION_CONFIG;
}

export function getCelebrationConfig(): GrupmarCelebrationConfig {
  return EMPTY_CANONICAL_CELEBRATION_CONFIG;
}

export function writeCelebrationConfig(): GrupmarCelebrationConfig {
  console.warn("[GrupMar Time] writeCelebrationConfig legacy ignorado. Fuente canónica: Supabase.");
  return EMPTY_CANONICAL_CELEBRATION_CONFIG;
}

export function saveCelebrationConfig(): GrupmarCelebrationConfig {
  console.warn("[GrupMar Time] saveCelebrationConfig legacy ignorado. Fuente canónica: Supabase.");
  return EMPTY_CANONICAL_CELEBRATION_CONFIG;
}

/**
 * Lecturas reales desde Supabase.
 */
export async function fetchBirthdaysToday(referenceDate?: string) {
  const ref = referenceDate || todayISO();

  const { data, error } = await (supabase as any).rpc("gmt_birthdays_today", {
    p_ref_date: ref,
  });

  if (error) throw error;

  const refMMDD = mmddFromDateLike(ref);
  return ((data || []) as CanonicalBirthday[]).filter((row) => {
    const birthdayMMDD = mmddFromDateLike(row?.mm_dd || row?.birth_date);
    return Boolean(refMMDD && birthdayMMDD && birthdayMMDD === refMMDD);
  });
}

export async function getBirthdaysToday(referenceDate?: string) {
  return fetchBirthdaysToday(referenceDate);
}

export async function fetchUpcomingBirthdays(days = 30, referenceDate?: string) {
  const ref = referenceDate || todayISO();

  const { data, error } = await (supabase as any).rpc("gmt_birthdays_upcoming", {
    p_days: days,
    p_ref_date: ref,
  });

  if (error) throw error;
  return (data || []) as CanonicalBirthday[];
}

export function getUpcomingBirthdays(_sourceOrDays?: any, _referenceDate?: string) {
  // FACHADA LEGACY SINCRONA.
  // index.tsx llama .slice sobre este resultado.
  // Por eso aquí SIEMPRE devolvemos array.
  // Para BD real usar fetchUpcomingBirthdays().
  return [];
}

export async function fetchTodayHolidays(referenceDate?: string) {
  const mmdd = mmddFromDateLike(referenceDate || todayISO()) || todayMMDD();

  const { data, error } = await (supabase as any)
    .from("company_holidays")
    .select("*")
    .eq("active", true)
    .eq("mm_dd", mmdd);

  if (error) throw error;
  return data || [];
}

export async function getTodayHolidays(referenceDate?: string) {
  return fetchTodayHolidays(referenceDate);
}

export async function fetchTodaySaints(referenceDate?: string) {
  const mmdd = mmddFromDateLike(referenceDate || todayISO()) || todayMMDD();

  const { data, error } = await (supabase as any)
    .from("saints_calendar")
    .select("*")
    .eq("active", true)
    .eq("mm_dd", mmdd);

  if (error) throw error;
  return data || [];
}

export async function getTodaySaints(referenceDate?: string) {
  return fetchTodaySaints(referenceDate);
}

export async function fetchTodayCelebrations(referenceDate?: string): Promise<GrupmarCelebrationConfig> {
  const [birthdays, holidays, saints] = await Promise.all([
    fetchBirthdaysToday(referenceDate),
    fetchTodayHolidays(referenceDate),
    fetchTodaySaints(referenceDate),
  ]);

  const ref = referenceDate || todayISO();
  const refMMDD = mmddFromDateLike(ref);
  const strictBirthdays = birthdays.filter((row) => {
    const birthdayMMDD = mmddFromDateLike(row?.mm_dd || row?.birth_date);
    return Boolean(refMMDD && birthdayMMDD && birthdayMMDD === refMMDD);
  });

  return {
    birthdays: strictBirthdays,
    holidays,
    saints,
    nameDays: saints,
    source: EMPTY_CANONICAL_CELEBRATION_CONFIG.source,
  };
}

/**
 * Compatibilidad: se mantiene síncrona para no romper render de home.
 * Para BD real usar fetchTodayCelebrations().
 */
export function getTodayCelebrations(): GrupmarCelebrationConfig {
  return EMPTY_CANONICAL_CELEBRATION_CONFIG;
}

/**
 * Cumpleaños por objeto profile.
 * Universal para todos los empleados.
 * Sólo true si el objeto trae birth_date real y coincide MM-DD con la fecha.
 */
export function isBirthdayPerson(person: any, referenceDate?: string | Date) {
  const birthDate =
    person?.birth_date ||
    person?.birthDate ||
    person?.birthday ||
    person?.fecha_nacimiento ||
    person?.fechaNacimiento ||
    null;

  if (!birthDate) return false;

  const ref =
    referenceDate instanceof Date
      ? referenceDate.toISOString().slice(0, 10)
      : referenceDate || todayISO();

  return mmddFromDateLike(birthDate) === mmddFromDateLike(ref);
}

export function isBirthdayToday(person: any, referenceDate?: string | Date) {
  return isBirthdayPerson(person, referenceDate);
}

export function getPersonBirthdayMMDD(person: any) {
  const birthDate =
    person?.birth_date ||
    person?.birthDate ||
    person?.birthday ||
    person?.fecha_nacimiento ||
    person?.fechaNacimiento ||
    null;

  return mmddFromDateLike(birthDate);
}

export function prettyMMDD(value: any) {
  const mmdd = mmddFromDateLike(value) || String(value || "").trim();

  if (/^\d{2}-\d{2}$/.test(mmdd)) {
    const [mm, dd] = mmdd.split("-");
    return `${dd}/${mm}`;
  }

  return mmdd;
}

export function formatMMDD(value: any) {
  return prettyMMDD(value);
}

export function mmddToDDMM(value: any) {
  return prettyMMDD(value);
}

export function getNameDayForProfile(profile: any, source?: any) {
  const name = normalizeText(firstNameOf(profile));
  if (!name) return null;

  let saints: any[] = [];

  if (Array.isArray(source)) saints = source;
  else if (Array.isArray(source?.saints)) saints = source.saints;
  else if (Array.isArray(source?.nameDays)) saints = source.nameDays;
  else return null;

  const today = todayMMDD();

  for (const saint of saints) {
    const mmdd = saint?.mm_dd || saint?.date || saint?.fecha || "";
    if (mmdd && String(mmdd).slice(0, 5) !== today) continue;

    const names = normalizeText(saint?.names || saint?.name || saint?.nombres || "");
    if (!names) continue;

    const parts = names.split(/[,;/]/).map((x: string) => x.trim()).filter(Boolean);
    if (parts.includes(name)) return saint;
  }

  return null;
}

export function getNameDayToday(profile: any, source?: any) {
  return getNameDayForProfile(profile, source);
}

export function isNameDayPerson(profile: any, source?: any) {
  return Boolean(getNameDayForProfile(profile, source));
}

export const BIRTHDAY_SOURCE = "public.profiles.birth_date";
export const HOLIDAYS_SOURCE = "public.company_holidays";
export const SAINTS_SOURCE = "public.saints_calendar";


export async function getUpcomingBirthdaysAsync(days = 30, referenceDate?: string) {
  return fetchUpcomingBirthdays(days, referenceDate);
}


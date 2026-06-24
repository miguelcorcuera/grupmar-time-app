import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, callRegisterEntry, callRegisterEvent, formatTime } from "@/lib/grupmar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Clock,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  UtensilsCrossed,
  FileText,
  DoorOpen,
  DoorClosed,
  PauseCircle,
  PlayCircle,
  Loader2,
  AlertTriangle,
  Timer,
  CalendarDays,
  CalendarCheck2,
  MapPin,
  Sparkles,
  Palette,
  Sun,
  Moon,
  Check,
  Newspaper,
  Megaphone,
} from "lucide-react";
import { toast } from "sonner";
import { AccessMap, ACCESS_SECURITY_VERSION, captureAccessSnapshot, riskClasses, riskLabel, RiskIcon, type AccessSnapshot } from "@/lib/accessSecurity";
import { getNameDayForProfile, getTodayCelebrations, getUpcomingBirthdays, isBirthdayPerson, readCelebrationConfig, prettyMMDD, fetchTodayCelebrations } from "@/lib/grupmarCelebrations";
import { buildCheckinCards, buildCompanyTickerItems, readCheckinMessageSettings, readCompanyTickerSettings } from "@/lib/grupmarCheckinMessages";
import { getPublishedInternalNewsFromItems, loadMyReadNewsIds, loadPublicInternalNews } from "@/lib/grupmarInternalNews";
import { applySavedUserTheme } from "@/lib/grupmarUserTheme";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  head: () => ({ meta: [{ title: "Mi jornada | GrupMar Time" }] }),
  component: Home,
});

type EntryResult = {
  full_name?: string;
  event_time?: string;
  server_time?: string;
  expected_time?: string;
  shift_end_time?: string;
  shift_close_deadline?: string;
  exit_grace_minutes?: number;
  late_tolerance_minutes?: number;
  lunch_start_time?: string;
  lunch_end_time?: string;
  max_lunch_minutes?: number;
  is_late?: boolean;
  late_minutes_total?: number;
  late_minutes_after_tolerance?: number;
  ip_address?: string;
  is_company_network?: boolean;
  connection_location_status?: "company_network" | "outside_company_network" | "unknown";
  security_flag?: boolean;
  message?: string;
  blocked?: boolean;
  closed?: boolean;
  error?: string;
};

type EventRow = {
  id: string;
  event_type: string;
  event_time: string;
  connection_location_status: string | null;
  ip_address: string | null;
  status?: string | null;
  requires_admin_review?: boolean | null;
  lunch_window_status?: string | null;
};

const EVENT_LABEL: Record<string, string> = {
  ENTRY: "Entrada",
  LUNCH_START: "Inicio almuerzo",
  LUNCH_END: "Fin almuerzo",
  PERMISSION_START: "Salida por permiso",
  PERMISSION_END: "Retorno de permiso",
  EXTRA_EXIT_START: "Salida extraordinaria",
  EXTRA_EXIT_END: "Retorno salida extra",
  EXIT: "Salida final",
};

const toMinutes = (t?: string | null) => {
  if (!t) return null;
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

const fmtMinutes = (minutes: number | null | undefined) => {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes) || minutes < 0) return "-";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} h ${String(m).padStart(2, "0")} min`;
};

const diffMinutes = (from?: string | null, to?: string | null) => {
  if (!from || !to) return 0;
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.floor((b - a) / 60000);
};

const DEFAULT_SHIFT_START = "08:00";
const DEFAULT_SHIFT_END = "17:00";
const DEFAULT_ENTRY_EARLY_MINUTES = 10;
const DEFAULT_EXIT_GRACE_MINUTES = 10;

const PASTEL_HOME_VERSION = "Mi jornada v15.7 · red/oficina unificada · 19/06/2026";

type ModuleId = "celebrations" | "news" | "schedule" | "summary" | "security" | "alerts" | "actions" | "balance" | "events";

const MODULE_ORDER_KEY = "grupmar_time_home_module_order_v1";
const VISIBLE_MODULES_KEY = "grupmar_time_home_visible_modules_v1";
const DEFAULT_MODULE_ORDER: ModuleId[] = ["celebrations", "schedule", "summary", "security", "actions", "alerts", "balance", "events"];

const MODULE_LABELS: Record<ModuleId, string> = {
  celebrations: "Cumpleaños / santos",
  news: "Informativo interno",
  schedule: "Turno de hoy",
  summary: "Resumen de jornada",
  security: "Ubicación / seguridad",
  alerts: "Alertas",
  actions: "Marcaciones",
  balance: "Balance",
  events: "Eventos",
};

function readModuleOrder(): ModuleId[] {
  if (typeof window === "undefined") return DEFAULT_MODULE_ORDER;
  try {
    const raw = window.localStorage.getItem(MODULE_ORDER_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const clean = Array.isArray(parsed) ? parsed.filter((x) => DEFAULT_MODULE_ORDER.includes(x)) as ModuleId[] : [];
    return [...clean, ...DEFAULT_MODULE_ORDER.filter((x) => !clean.includes(x))];
  } catch {
    return DEFAULT_MODULE_ORDER;
  }
}

function saveModuleOrder(order: ModuleId[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MODULE_ORDER_KEY, JSON.stringify(order));
}

function readVisibleModules(): ModuleId[] {
  if (typeof window === "undefined") return DEFAULT_MODULE_ORDER;
  try {
    const raw = window.localStorage.getItem(VISIBLE_MODULES_KEY);
    if (!raw) return DEFAULT_MODULE_ORDER;
    const parsed = JSON.parse(raw);
    const clean = Array.isArray(parsed) ? parsed.filter((x) => DEFAULT_MODULE_ORDER.includes(x)) as ModuleId[] : [];
    return clean;
  } catch {
    return DEFAULT_MODULE_ORDER;
  }
}

function saveVisibleModules(modules: ModuleId[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(VISIBLE_MODULES_KEY, JSON.stringify(modules));
}


type LocalEmployee = {
  id: string;
  full_name: string;
  email?: string | null;
  employee_code?: string | null;
  department?: string | null;
  center?: string | null;
  active?: boolean | null;
};

type LocalShift = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  lunch_start_time?: string | null;
  lunch_end_time?: string | null;
  lunch_minutes?: number | null;
  tolerance_minutes?: number | null;
  exit_grace_minutes?: number | null;
  active?: boolean | null;
  color?: string | null;
};

type LocalAssignment = {
  id: string;
  employee_id: string;
  shift_id: string;
  start_date: string;
  end_date?: string | null;
  active?: boolean | null;
};

const dayNamesShort = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function addDaysLocal(date: string, n: number) {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function mondayOfLocal(date: string) {
  const d = new Date(date + "T12:00:00");
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

function prettyDateLocal(date: string) {
  return new Date(date + "T12:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

function shiftToneClass(index: number) {
  return "bg-[#fff4c7] text-slate-950 border-[#f4d98a]";
}

type UiThemeMode = "light" | "dark";
type UiPaletteKey = "yellow" | "mint" | "lavender" | "rose" | "sky" | "sand";

const UI_THEME_COOKIE = "grupmar_time_ui_theme_v1";

const UI_PALETTES: Record<UiPaletteKey, {
  name: string;
  dot: string;
  shiftBg: string;
  shiftBorder: string;
  headerFrom: string;
  headerTo: string;
  summaryBg: string;
  badgeBg: string;
  badgeText: string;
}> = {
  yellow: {
    name: "Amarillo",
    dot: "#fff4c7",
    shiftBg: "#fff4c7",
    shiftBorder: "#f4d98a",
    headerFrom: "#fff8df",
    headerTo: "#fff6d8",
    summaryBg: "#fff8dc",
    badgeBg: "#fff4c7",
    badgeText: "#6f5200",
  },
  mint: {
    name: "Menta",
    dot: "#dcfce7",
    shiftBg: "#dcfce7",
    shiftBorder: "#9fe7bb",
    headerFrom: "#eefbf3",
    headerTo: "#e8fff1",
    summaryBg: "#edf9f2",
    badgeBg: "#dcfce7",
    badgeText: "#24553a",
  },
  lavender: {
    name: "Lavanda",
    dot: "#eee7ff",
    shiftBg: "#eee7ff",
    shiftBorder: "#d3c2ff",
    headerFrom: "#f7f2ff",
    headerTo: "#efe7ff",
    summaryBg: "#f3edff",
    badgeBg: "#eee7ff",
    badgeText: "#4f3a7a",
  },
  rose: {
    name: "Rosa",
    dot: "#ffe4ec",
    shiftBg: "#ffe4ec",
    shiftBorder: "#ffc0d1",
    headerFrom: "#fff3f6",
    headerTo: "#ffeaf0",
    summaryBg: "#fff0f3",
    badgeBg: "#ffe4ec",
    badgeText: "#7a3047",
  },
  sky: {
    name: "Cielo",
    dot: "#dff0ff",
    shiftBg: "#dff0ff",
    shiftBorder: "#afd6f7",
    headerFrom: "#eef8ff",
    headerTo: "#e2f2ff",
    summaryBg: "#eef6ff",
    badgeBg: "#dff0ff",
    badgeText: "#244d71",
  },
  sand: {
    name: "Arena",
    dot: "#f3eadb",
    shiftBg: "#f3eadb",
    shiftBorder: "#dfcdb2",
    headerFrom: "#faf5ec",
    headerTo: "#f3eadb",
    summaryBg: "#f7efe2",
    badgeBg: "#f3eadb",
    badgeText: "#5f4930",
  },
};

function getCookieValue(name: string) {
  if (typeof document === "undefined") return "";
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith(name + "="))
    ?.split("=")[1] ?? "";
}

function saveUiThemeCookie(value: { palette: UiPaletteKey; mode: UiThemeMode }) {
  if (typeof document === "undefined") return;
  const encoded = encodeURIComponent(JSON.stringify(value));
  document.cookie = `${UI_THEME_COOKIE}=${encoded}; path=/; max-age=31536000; SameSite=Lax`;
  localStorage.setItem(UI_THEME_COOKIE, encoded);
}

function readUiThemeCookie(): { palette: UiPaletteKey; mode: UiThemeMode } {
  const fallback = { palette: "yellow" as UiPaletteKey, mode: "light" as UiThemeMode };
  if (typeof document === "undefined") return fallback;
  const raw = getCookieValue(UI_THEME_COOKIE) || localStorage.getItem(UI_THEME_COOKIE) || "";
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    const palette = (parsed.palette in UI_PALETTES ? parsed.palette : fallback.palette) as UiPaletteKey;
    const mode = parsed.mode === "dark" ? "dark" : "light";
    return { palette, mode };
  } catch {
    return fallback;
  }
}


type LocalPlan = {
  id: string;
  employee_id: string;
  shift_id: string;
  date: string;
  published?: boolean | null;
  project?: string | null;
  note?: string | null;
};


function buildWeeklySchedule(profile: any, entry: EntryResult | null) {
  const today = new Date().toISOString().slice(0, 10);
  const weekStart = mondayOfLocal(today);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysLocal(weekStart, i));

  const profileEmployee = {
    id: profile?.id ?? "current-profile",
    full_name: profile?.full_name ?? "Usuario",
    email: profile?.email ?? "",
    center: "Son Oms",
  };

  const start = (entry?.expected_time ?? DEFAULT_SHIFT_START).slice(0, 5);
  const end = (entry?.shift_end_time ?? DEFAULT_SHIFT_END).slice(0, 5);

  const entryShift = {
    id: "supabase-active-shift",
    name: start && end ? "Oficina " + start + " - " + end : "Turno asignado",
    start_time: start,
    end_time: end,
    lunch_start_time: entry?.lunch_start_time ?? "13:00",
    lunch_end_time: entry?.lunch_end_time ?? "14:00",
    lunch_minutes: entry?.max_lunch_minutes ?? 60,
    tolerance_minutes: entry?.late_tolerance_minutes ?? 10,
    exit_grace_minutes: entry?.exit_grace_minutes ?? DEFAULT_EXIT_GRACE_MINUTES,
    active: true,
  };

  return weekDays.map((date, i) => {
    const weekend = i >= 5;
    return {
      date,
      label: dayNamesShort[i],
      shift: weekend ? null : entryShift,
      employee: profileEmployee,
      assignment: null,
      plan: null,
      tone: shiftToneClass(i),
    };
  });
}


const currentMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

const isBeforeAllowedEntry = (expectedTime = DEFAULT_SHIFT_START, earlyMinutes = DEFAULT_ENTRY_EARLY_MINUTES) => {
  const expected = toMinutes(expectedTime);
  if (expected === null) return false;
  return currentMinutes() < expected - earlyMinutes;
};

const isInsideShiftWindow = (startTime = DEFAULT_SHIFT_START, endTime = DEFAULT_SHIFT_END, now = currentMinutes()) => {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (start === null || end === null) return true;
  if (start === end) return true;
  if (end > start) return now >= start && now <= end;
  return now >= start || now <= end;
};

const outsideShiftMessage = (scheduleLabel: string) =>
  `No puedes marcar aún tus marcaciones. Te invitamos a hacerlo en el horario de ${scheduleLabel}. Puedes ingresar y visualizar tu información, pero las marcaciones están deshabilitadas fuera de turno.`;

function Home() {
  useEffect(() => { applySavedUserTheme(); }, []);
  const [userId, setUserId] = useState<string>();
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id));
  }, []);

  const { profile, role, loading: pLoading } = useProfile(userId);
  const [homePermissions, setHomePermissions] = useState<Record<string, boolean>>({});

  // v15.3: si Supabase autentica pero el perfil falla, no dejamos la pantalla girando para siempre.
  useEffect(() => {
    if (!pLoading && !profile) setLoaded(true);
  }, [pLoading, profile?.id]);
  const [entry, setEntry] = useState<EntryResult | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [lastNotice, setLastNotice] = useState<string | null>(null);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [accessSnapshot, setAccessSnapshot] = useState<AccessSnapshot | null>(null);
  const [accessBusy, setAccessBusy] = useState(false);
  const [mapInteractionEnabled, setMapInteractionEnabled] = useState(false);
  const [themePanelOpen, setThemePanelOpen] = useState(false);
  const [uiTheme, setUiTheme] = useState(() => readUiThemeCookie());
  const [moduleOrder, setModuleOrder] = useState<ModuleId[]>(() => readModuleOrder());
  const [visibleModules, setVisibleModules] = useState<ModuleId[]>(() => readVisibleModules());
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [draggedModule, setDraggedModule] = useState<ModuleId | null>(null);

  const palette = UI_PALETTES[uiTheme.palette];
  const [checkinMessagesDismissed, setCheckinMessagesDismissed] = useState(false);

  const celebrationConfig = useMemo(() => readCelebrationConfig(), []);
  const todayCelebrations = useMemo(() => getTodayCelebrations(celebrationConfig), [celebrationConfig]);
  const [dbTodayCelebrations, setDbTodayCelebrations] = useState<any | null>(null);

  useEffect(() => {
    let alive = true;

    fetchTodayCelebrations()
      .then((data) => {
        if (!alive) return;
        setDbTodayCelebrations({
          birthdays: Array.isArray(data?.birthdays) ? data.birthdays : [],
          holidays: Array.isArray(data?.holidays) ? data.holidays : [],
          saints: Array.isArray(data?.saints) ? data.saints : [],
          nameDays: Array.isArray(data?.nameDays) ? data.nameDays : Array.isArray(data?.saints) ? data.saints : [],
          source: data?.source,
        });
      })
      .catch((error) => {
        console.warn("[GrupMar Time] No se pudieron cargar cumpleaños/santos desde BD", error);
        if (alive) setDbTodayCelebrations(null);
      });

    return () => {
      alive = false;
    };
  }, []);

  const effectiveTodayCelebrations = dbTodayCelebrations ?? todayCelebrations;
  const upcomingBirthdays = useMemo(() => getUpcomingBirthdays(celebrationConfig, 14), [celebrationConfig]);
    const myBirthdayToday = effectiveTodayCelebrations.birthdays.find((b: any) => {
    const sameId = String(b?.profile_id || b?.id || "") === String(profile?.id || "");
    const sameEmail = b?.email && profile?.email && String(b.email).toLowerCase() === String(profile.email).toLowerCase();
    const sameName = b?.full_name && profile?.full_name && String(b.full_name).trim().toLowerCase() === String(profile.full_name).trim().toLowerCase();
    return sameId || sameEmail || sameName || isBirthdayPerson(profile);
  });
  const mySaintToday = getNameDayForProfile(profile, celebrationConfig);
  const checkinMessageSettings = useMemo(() => readCheckinMessageSettings(), []);
  const checkinCards = useMemo(
    () => buildCheckinCards({ profile, todayCelebrations: effectiveTodayCelebrations, myBirthdayToday, mySaintToday }, checkinMessageSettings),
    [profile, effectiveTodayCelebrations, myBirthdayToday, mySaintToday, checkinMessageSettings],
  );
  const companyTickerSettings = useMemo(() => readCompanyTickerSettings(), []);
  const companyTickerItems = useMemo(() => buildCompanyTickerItems(profile, companyTickerSettings), [profile, companyTickerSettings]);
  const [newsRows, setNewsRows] = useState<InternalNewsItem[]>([]);
  const [readNewsIds, setReadNewsIds] = useState<string[]>([]); // HOME_NEWS_READS_CANONICAL_V1

  useEffect(() => {
    let alive = true;

    loadPublicInternalNews()
      .then((rows) => {
        if (alive) setNewsRows(rows);
      })
      .catch((err) => {
        console.error(err);
        if (alive) setNewsRows([]);
      });

    return () => {
      alive = false;
    };
  }, []);

  // HOME_NEWS_READS_CANONICAL_V1
  useEffect(() => {
    let alive = true;
    const profileId = profile?.id ? String(profile.id) : "";

    async function refreshReadNewsIds() {
      if (!profileId) {
        if (alive) setReadNewsIds([]);
        return;
      }

      try {
        const ids = await loadMyReadNewsIds(profileId);
        if (alive) setReadNewsIds(ids);
      } catch (err) {
        console.error("No se pudieron cargar las lecturas de noticias.", err);
        if (alive) setReadNewsIds([]);
      }
    }

    void refreshReadNewsIds();

    const onFocus = () => { void refreshReadNewsIds(); };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refreshReadNewsIds();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      alive = false;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [profile?.id]);

  const internalNews = useMemo(() => getPublishedInternalNewsFromItems(newsRows, profile).slice(0, 6), [newsRows, profile, nowTick]);

  // HOME_TOP_BUTTONS_ACCESS_PROFILE_V58
  useEffect(() => {
    let alive = true;

    async function loadTopButtonPermissions() {
      if (!userId) {
        if (alive) setHomePermissions({});
        return;
      }

      const { data: profileAccess, error: profileAccessError } = await (supabase as any)
        .from("profiles")
        .select("access_profile_id,email")
        .eq("user_id", userId)
        .maybeSingle();

      if (profileAccessError) {
        console.warn("home top buttons profile error", profileAccessError.message);
        if (alive) setHomePermissions({});
        return;
      }

      const accessProfileId = (profileAccess as any)?.access_profile_id || (profile as any)?.access_profile_id;
      if (!accessProfileId) {
        if (alive) setHomePermissions({});
        return;
      }

      const { data, error } = await (supabase as any)
        .from("access_profiles")
        .select("module_permissions")
        .eq("id", accessProfileId)
        .maybeSingle();

      if (error) {
        console.warn("home top buttons access profile error", error.message);
        if (alive) setHomePermissions({});
        return;
      }

      const raw = (data as any)?.module_permissions;
      const clean = raw && typeof raw === "object" && !Array.isArray(raw)
        ? Object.fromEntries(Object.entries(raw).filter(([, value]) => value === true))
        : {};

      if (alive) setHomePermissions(clean as Record<string, boolean>);
    }

    loadTopButtonPermissions();

    return () => {
      alive = false;
    };
  }, [userId, (profile as any)?.access_profile_id]);

  const readNewsIdSet = useMemo(() => new Set(readNewsIds.map(String)), [readNewsIds]);
  const hasUnreadNews = internalNews.some((item) => item.id && !readNewsIdSet.has(String(item.id)));
  const homeEmail = String((profile as any)?.email || "").toLowerCase();
  const isSuperAdminHome = homeEmail === "ma.corcuera@grupomarport.com" || homeEmail.includes("miguel") || homeEmail.includes("admin");
  const hasHomePermission = (permission: string) => homePermissions?.[permission] === true || isSuperAdminHome;
  const canOpenShifts = hasHomePermission("admin.shifts");
  const canOpenAdminPanel = Object.keys(homePermissions || {}).some((key) => key.startsWith("admin.") && homePermissions[key] === true) || isSuperAdminHome;

  useEffect(() => {
    saveUiThemeCookie(uiTheme);
    document.documentElement.dataset.grupmarTheme = uiTheme.mode;
  }, [uiTheme]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const down = (ev: KeyboardEvent) => setMapInteractionEnabled(ev.ctrlKey || ev.metaKey);
    const up = () => setMapInteractionEnabled(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", up);
    };
  }, []);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      try {
        setAccessBusy(true);
        const access = await captureAccessSnapshot({ employeeId: profile.id, employeeName: profile.full_name, eventType: "ENTRY_LOGIN" });
        setAccessSnapshot(access);

        const today = new Date().toISOString().slice(0, 10);
        const todayPlan = buildWeeklySchedule(profile, null).find((d) => d.date === today);
        const assignedStart = (todayPlan?.shift?.start_time ?? DEFAULT_SHIFT_START).slice(0, 5);
        const assignedEnd = (todayPlan?.shift?.end_time ?? DEFAULT_SHIFT_END).slice(0, 5);
        const assignedLabel = `${assignedStart} - ${assignedEnd}`;

        // Regla estricta: el login permite entrar y visualizar, pero no marca nada fuera del turno asignado.
        // En producción esta misma validación debe vivir también en la función RPC del servidor.
        if (!isInsideShiftWindow(assignedStart, assignedEnd)) {
          const message = outsideShiftMessage(assignedLabel);
          setEntry({
            blocked: true,
            expected_time: assignedStart,
            shift_end_time: assignedEnd,
            exit_grace_minutes: DEFAULT_EXIT_GRACE_MINUTES,
            message,
          });
          toast.error("Marcaciones deshabilitadas fuera de turno");
          return;
        }

        const result = (await callRegisterEntry()) as EntryResult;
        setEntry({ ...result, ip_address: result.ip_address ?? access.ip_address ?? undefined, exit_grace_minutes: result.exit_grace_minutes ?? DEFAULT_EXIT_GRACE_MINUTES });
        if (result.blocked) toast.error(result.message ?? "Marcación bloqueada");
      } catch (e) {
        toast.error("No se pudo validar la entrada: " + (e as Error).message);
      } finally {
        setAccessBusy(false);
        setLoaded(true);
        await reloadEvents();
      }
    })();
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function reloadEvents() {
    if (!profile?.id) {
      setEvents([]);
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await (supabase as any)
      .from("attendance_events")
      .select("id, event_type, event_time, ip_address, status, is_company_network, notes")
      .eq("profile_id", profile.id)
      .eq("event_date", today)
      .order("event_time", { ascending: true });

    if (error) {
      console.error("reloadEvents v15.3", error);
      setEvents([]);
      return;
    }

    setEvents(((data ?? []) as any[]).map((ev) => ({
      id: ev.id,
      event_type: ev.event_type,
      event_time: ev.event_time,
      ip_address: ev.ip_address ?? null,
      status: ev.status ?? null,
      connection_location_status: ev.is_company_network ? "company_network" : "unknown",
      requires_admin_review: ev.status === "manual_review" || ev.status === "blocked",
      lunch_window_status: null,
    })) as EventRow[]);
  }

  async function trigger(event_type: string) {
    if (markingDisabled) {
      toast.error("Marcaciones deshabilitadas fuera de turno");
      setLastNotice(markingWindowMessage);
      return;
    }
    setBusy(event_type);
    setLastNotice(null);
    try {
      const access = await captureAccessSnapshot({ employeeId: profile?.id, employeeName: profile?.full_name, eventType: event_type });
      setAccessSnapshot(access);
      const data = await callRegisterEvent(event_type);

      if (data?.error) {
        toast.error("No se pudo registrar: " + data.error);
        setLastNotice(data.error);
      } else if (event_type === "LUNCH_START" && lunchOutsideWindow) {
        toast.warning("Almuerzo registrado fuera de franja. Queda para revisión/regularización.");
        setLastNotice("Almuerzo registrado fuera de la franja prevista. Motivo posible: reunión, operativo o imposibilidad de salir a la hora. Requiere revisión/regularización.");
      } else if (event_type === "LUNCH_START" && !lunchWindowConfigured) {
        toast.warning("Almuerzo registrado sin franja configurada. Queda para revisión/regularización.");
        setLastNotice("Almuerzo registrado sin franja de almuerzo configurada. Requiere revisión/regularización.");
      } else if (data?.blocked) {
        toast.error(data.message ?? "Marcación bloqueada");
        setLastNotice(data.message ?? "Marcación bloqueada");
      } else if (data?.requires_admin_review) {
        toast.warning(data?.message ?? "Marcación registrada con incidencia. Requiere revisión.");
        setLastNotice(data?.message ?? "Marcación registrada con incidencia. Requiere revisión.");
      } else {
        toast.success(data?.message ?? EVENT_LABEL[event_type] + " registrado");
        setLastNotice(data?.message ?? null);
      }

      await reloadEvents();
      const refreshed = (await callRegisterEntry()) as EntryResult;
      setEntry(refreshed);
    } catch (e) {
      toast.error((e as Error).message);
      setLastNotice((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }

  const firstEvent = (type: string) => events.find((e) => e.event_type === type);
  const lastEvent = (type: string) => [...events].reverse().find((e) => e.event_type === type);
  const actualEntry = firstEvent("ENTRY");
  const actualExit = firstEvent("EXIT");
  const displayEntryTime = actualEntry?.event_time ?? entry?.event_time ?? null;
  const displayExitTime = actualExit?.event_time ?? null;
  const expectedEntryTime = (entry?.expected_time ?? DEFAULT_SHIFT_START).slice(0, 5);
  const expectedEntryMinutes = toMinutes(expectedEntryTime);
  const actualEntryMinutes = displayEntryTime ? (() => { const d = new Date(displayEntryTime); return d.getHours() * 60 + d.getMinutes(); })() : null;
  const entryToleranceMinutes = Number(entry?.late_tolerance_minutes ?? 10);
  const clientLateTotal = actualEntryMinutes !== null && expectedEntryMinutes !== null ? Math.max(0, actualEntryMinutes - expectedEntryMinutes) : 0;
  const clientLateAfterTolerance = Math.max(0, clientLateTotal - entryToleranceMinutes);
  const clientIsLate = !!displayEntryTime && clientLateAfterTolerance > 0;
  const lunchStart = lastEvent("LUNCH_START");
  const lunchEnd = lastEvent("LUNCH_END");

  const has = (t: string) => events.some((e) => e.event_type === t);
  const openLunch = events.filter(e => e.event_type === "LUNCH_START").length > events.filter(e => e.event_type === "LUNCH_END").length;
  const openPerm = events.filter(e => e.event_type === "PERMISSION_START").length > events.filter(e => e.event_type === "PERMISSION_END").length;
  const openExtra = events.filter(e => e.event_type === "EXTRA_EXIT_START").length > events.filter(e => e.event_type === "EXTRA_EXIT_END").length;
  const exited = has("EXIT");

  const shiftEndMs = useMemo(() => {
    const end = entry?.shift_end_time ?? DEFAULT_SHIFT_END;
    const d = new Date();
    const [hh, mm] = end.slice(0, 5).split(":").map(Number);
    d.setHours(hh, mm, 0, 0);
    return d.getTime();
  }, [entry?.shift_end_time]);
  const exitGraceMinutes = Number(entry?.exit_grace_minutes ?? DEFAULT_EXIT_GRACE_MINUTES);
  const deadlineMs = shiftEndMs ? shiftEndMs + exitGraceMinutes * 60000 : (entry?.shift_close_deadline ? new Date(entry.shift_close_deadline).getTime() : null);
  const preEndNoticeMs = shiftEndMs ? shiftEndMs - 10 * 60000 : null;
  const inPreEndNotice = !!preEndNoticeMs && nowTick >= preEndNoticeMs && nowTick < shiftEndMs && !exited;

  const msToClose = deadlineMs ? deadlineMs - nowTick : null;
  const secondsToClose = msToClose !== null ? Math.max(0, Math.floor(msToClose / 1000)) : null;
  const inExitCountdown = !!deadlineMs && !!shiftEndMs && nowTick >= shiftEndMs && nowTick <= deadlineMs && !exited;
  const systemClosed = !!deadlineMs && nowTick > deadlineMs;
  const closeCountdown = secondsToClose !== null
    ? `${Math.floor(secondsToClose / 60)}:${String(secondsToClose % 60).padStart(2, "0")}`
    : null;

  const nowMinutes = (() => {
    const d = new Date(nowTick);
    return d.getHours() * 60 + d.getMinutes();
  })();
  const lunchStartMin = toMinutes(entry?.lunch_start_time);
  const lunchEndMin = toMinutes(entry?.lunch_end_time);
  const lunchNotStarted = !has("LUNCH_START");
  const lunchTooEarly = lunchStartMin !== null && nowMinutes < lunchStartMin;
  const lunchWindowExpired = lunchEndMin !== null && nowMinutes > lunchEndMin;
  const lunchInsideWindow = lunchStartMin !== null && lunchEndMin !== null && nowMinutes >= lunchStartMin && nowMinutes <= lunchEndMin;
  const lunchWindowConfigured = lunchStartMin !== null && lunchEndMin !== null;
  const lunchOutsideWindow = lunchWindowConfigured && !lunchInsideWindow;
  // Regla realista: se permite marcar almuerzo aunque esté fuera de franja o no esté configurada.
  // En esos casos queda como incidencia/revisión, porque en la vida real puede haber reunión, operativo, retraso, etc.
  const canStartLunchNow = !!displayEntryTime && lunchNotStarted && !exited && !systemClosed && !openLunch;
  const lunchHint = lunchWindowConfigured
    ? lunchInsideWindow
      ? `Franja de almuerzo correcta: ${entry?.lunch_start_time?.slice(0, 5)} - ${entry?.lunch_end_time?.slice(0, 5)}`
      : `Fuera de la franja ${entry?.lunch_start_time?.slice(0, 5)} - ${entry?.lunch_end_time?.slice(0, 5)}. Se permite marcar, pero quedará para revisión/regularización.`
    : "Almuerzo sin franja configurada. Se permite marcar, pero quedará para revisión/regularización.";

  const blockExit = openLunch || openPerm || openExtra || exited || systemClosed;
  const isEarlyExit = !!shiftEndMs && nowTick < shiftEndMs && !exited;

  const referenceNowIso = new Date(nowTick).toISOString();

  function sumPairedEventMinutes(startType: string, endType: string) {
    let total = 0;
    let openedAt: string | null = null;
    const limit = displayExitTime ?? referenceNowIso;

    for (const ev of events) {
      if (ev.event_type === startType && !openedAt) {
        openedAt = ev.event_time;
      } else if (ev.event_type === endType && openedAt) {
        total += diffMinutes(openedAt, ev.event_time);
        openedAt = null;
      }
    }

    if (openedAt) {
      total += diffMinutes(openedAt, limit);
    }

    return total;
  }

  const grossWorkedMinutes = displayEntryTime
    ? diffMinutes(displayEntryTime, displayExitTime ?? referenceNowIso)
    : 0;

  const lunchMinutes = sumPairedEventMinutes("LUNCH_START", "LUNCH_END");
  const permissionMinutes = sumPairedEventMinutes("PERMISSION_START", "PERMISSION_END");
  const extraExitMinutes = sumPairedEventMinutes("EXTRA_EXIT_START", "EXTRA_EXIT_END");
  const nonWorkingMinutes = lunchMinutes + permissionMinutes + extraExitMinutes;
  const netWorkedMinutes = Math.max(0, grossWorkedMinutes - nonWorkingMinutes);

  const todayBalanceDate = new Date().toISOString().slice(0, 10);
  const todayBalanceShift = buildWeeklySchedule(profile, entry).find((d) => d.date === todayBalanceDate)?.shift;

  const balanceStartTime = (todayBalanceShift?.start_time ?? entry?.expected_time ?? DEFAULT_SHIFT_START).slice(0, 5);
  const balanceEndTime = (todayBalanceShift?.end_time ?? entry?.shift_end_time ?? DEFAULT_SHIFT_END).slice(0, 5);
  const balanceStartMinutes = toMinutes(balanceStartTime);
  const balanceEndMinutes = toMinutes(balanceEndTime);
  const assignedScheduleLabel = `${balanceStartTime} - ${balanceEndTime}`;
  const insideAssignedShift = isInsideShiftWindow(balanceStartTime, balanceEndTime, nowMinutes);
  const markingWindowMessage = outsideShiftMessage(assignedScheduleLabel);
  const markingDisabled = !!entry?.blocked || !insideAssignedShift;

  let plannedGrossMinutes =
    balanceStartMinutes !== null && balanceEndMinutes !== null
      ? balanceEndMinutes - balanceStartMinutes
      : 8 * 60;
  if (plannedGrossMinutes < 0) plannedGrossMinutes += 24 * 60;

  // Regla visual pedida: para el trabajador el objetivo del día debe coincidir con el turno asignado.
  // Ejemplo Turno Tarde 14:00-22:00 = 8h objetivo. Las pausas marcadas se descuentan del trabajado real.
  const targetNetMinutes = plannedGrossMinutes || 8 * 60;
  const jornadaDeltaMinutes = netWorkedMinutes - targetNetMinutes;
  const jornadaCompletedOk = exited && jornadaDeltaMinutes >= 0;
  const jornadaCompletedShort = exited && jornadaDeltaMinutes < 0;
  const jornadaAlmostThere = !exited && displayEntryTime && targetNetMinutes - netWorkedMinutes <= 30 && targetNetMinutes - netWorkedMinutes > 0;
  const jornadaProgress = targetNetMinutes ? Math.min(100, Math.round((netWorkedMinutes / targetNetMinutes) * 100)) : 0;

  const jornadaStatus = jornadaCompletedOk
    ? {
        tone: "ok",
        title: "Jornada completa",
        message: `Trabajado: ${fmtMinutes(netWorkedMinutes)}. Objetivo: ${fmtMinutes(targetNetMinutes)}. Saldo a favor: ${fmtMinutes(jornadaDeltaMinutes)}.`,
        pill: "Cumplida",
      }
    : jornadaCompletedShort
      ? {
          tone: "danger",
          title: "Jornada incompleta",
          message: `Trabajado: ${fmtMinutes(netWorkedMinutes)}. Objetivo: ${fmtMinutes(targetNetMinutes)}. Debe: ${fmtMinutes(Math.abs(jornadaDeltaMinutes))}.`,
          pill: `Debe ${fmtMinutes(Math.abs(jornadaDeltaMinutes))}`,
        }
      : jornadaAlmostThere
        ? {
            tone: "warn",
            title: "Casi completa",
            message: `Lleva ${fmtMinutes(netWorkedMinutes)} de ${fmtMinutes(targetNetMinutes)}. Falta ${fmtMinutes(targetNetMinutes - netWorkedMinutes)}.`,
            pill: `Faltan ${fmtMinutes(targetNetMinutes - netWorkedMinutes)}`,
          }
        : {
            tone: "live",
            title: "Jornada en curso",
            message: displayEntryTime
              ? `Lleva ${fmtMinutes(netWorkedMinutes)} de ${fmtMinutes(targetNetMinutes)}. Progreso ${jornadaProgress}%.`
              : "Aún no hay entrada registrada.",
            pill: displayEntryTime ? `${jornadaProgress}%` : "Sin entrada",
          };

  const jornadaToneClass =
    jornadaStatus.tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : jornadaStatus.tone === "danger"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : jornadaStatus.tone === "warn"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-sky-200 bg-sky-50 text-sky-800";

  const beforeLunchMinutes = displayEntryTime && lunchStart
    ? diffMinutes(displayEntryTime, lunchStart.event_time)
    : null;
  const afterLunchMinutes = lunchEnd
    ? diffMinutes(lunchEnd.event_time, displayExitTime ?? referenceNowIso)
    : null;
  const lunchOpenMinutes = lunchStart && !lunchEnd
    ? diffMinutes(lunchStart.event_time, referenceNowIso)
    : null;

  
  // v15.7: una sola verdad para red/oficina.
  // Antes el resumen usaba entry.connection_location_status y el mapa usaba accessSnapshot.
  // Eso producia contradicciones: "No se pudo detectar la red" arriba y "Oficina validada" abajo.
  const OFFICE_IP = "80.24.218.227";

  const entryIp = String(entry?.ip_address ?? "");
  const accessIp = String(accessSnapshot?.ip_address ?? "");
  const entryLoc = entry?.connection_location_status;
  const accessLoc = String((accessSnapshot as any)?.connection_location_status ?? "");

  const officeValidated =
    entry?.is_company_network === true ||
    entryLoc === "company_network" ||
    accessLoc === "company_network" ||
    entryIp === OFFICE_IP ||
    accessIp === OFFICE_IP;

  const outsideOffice =
    !officeValidated &&
    (entryLoc === "outside_company_network" || accessLoc === "outside_company_network");

  const effectiveNetworkStatus = officeValidated
    ? "company_network"
    : outsideOffice
      ? "outside_company_network"
      : "unknown";

  const locBadge = effectiveNetworkStatus === "company_network"
    ? { cls: "bg-emerald-600 text-white", Icon: ShieldCheck, label: "Oficina validada" }
    : effectiveNetworkStatus === "outside_company_network"
      ? { cls: "bg-amber-500 text-white", Icon: ShieldAlert, label: "Fuera de oficina - pendiente de revision" }
      : { cls: "bg-slate-200 text-slate-700", Icon: ShieldX, label: "Red no detectada - pendiente de revision" };

  const NetIcon = locBadge.Icon;

  const stableAccessMap = useMemo(() => (
    <AccessMap snapshot={accessSnapshot} height={220} />
  ), [
    accessSnapshot?.latitude,
    accessSnapshot?.longitude,
    accessSnapshot?.accuracy,
    accessSnapshot?.risk_level,
    accessSnapshot?.ip_address,
  ]);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 14) return "Buenos días";
    if (h < 20) return "Buenas tardes";
    return "Buenas noches";
  })();

  function persistModuleOrder(next: ModuleId[]) {
    setModuleOrder(next);
    saveModuleOrder(next);
  }

  function persistVisibleModules(next: ModuleId[]) {
    const clean = next.filter((x) => DEFAULT_MODULE_ORDER.includes(x));
    setVisibleModules(clean);
    saveVisibleModules(clean);
  }

  function toggleModuleVisibility(id: ModuleId) {
    const exists = visibleModules.includes(id);
    const next = exists ? visibleModules.filter((x) => x !== id) : [...visibleModules, id];
    persistVisibleModules(next);
  }

  function showAllModules() {
    persistVisibleModules(DEFAULT_MODULE_ORDER);
    toast.success("Todos los módulos visibles.");
  }

  function hideAllModules() {
    persistVisibleModules([]);
    toast.success("Panel limpio. Activa sólo lo que necesites.");
  }

  function moduleRank(id: ModuleId) {
    const idx = moduleOrder.indexOf(id);
    return idx >= 0 ? idx : DEFAULT_MODULE_ORDER.indexOf(id);
  }

  function moveModule(id: ModuleId, direction: -1 | 1) {
    const current = [...moduleOrder];
    const idx = current.indexOf(id);
    if (idx < 0) return;
    const nextIdx = Math.max(0, Math.min(current.length - 1, idx + direction));
    if (nextIdx === idx) return;
    const [item] = current.splice(idx, 1);
    current.splice(nextIdx, 0, item);
    persistModuleOrder(current);
  }

  function dropModule(target: ModuleId) {
    if (!draggedModule || draggedModule === target) return;
    const current = [...moduleOrder];
    const from = current.indexOf(draggedModule);
    const to = current.indexOf(target);
    if (from < 0 || to < 0) return;
    const [item] = current.splice(from, 1);
    current.splice(to, 0, item);
    persistModuleOrder(current);
    setDraggedModule(null);
  }

  function resetModules() {
    persistModuleOrder(DEFAULT_MODULE_ORDER);
    persistVisibleModules(DEFAULT_MODULE_ORDER);
    toast.success("Panel restaurado: orden y módulos visibles.");
  }

  const ModuleFrame = ({ id, title, children }: { id: ModuleId; title: string; children: any }) => {
    if (!visibleModules.includes(id)) return null;
    return (
    <section
      draggable
      onDragStart={() => setDraggedModule(id)}
      onDragEnd={() => setDraggedModule(null)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => dropModule(id)}
      style={{ order: moduleRank(id) }}
      className={`group rounded-[1.7rem] transition ${draggedModule === id ? "scale-[.99] opacity-60" : ""}`}
    >
      <div className="mb-2 flex items-center justify-between rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-xs shadow-sm backdrop-blur">
        <div className="flex items-center gap-2 font-black text-slate-600">
          <span className="cursor-grab rounded-lg bg-slate-100 px-2 py-1 text-slate-500 active:cursor-grabbing" title="Arrastrar módulo">⋮⋮</span>
          <span>{title}</span>
        </div>
        <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:transition md:group-hover:opacity-100">
          <button type="button" className="rounded-lg border bg-white px-2 py-1 font-black text-slate-600" onClick={() => moveModule(id, -1)}>↑</button>
          <button type="button" className="rounded-lg border bg-white px-2 py-1 font-black text-slate-600" onClick={() => moveModule(id, 1)}>↓</button>
        </div>
      </div>
      {children}
    </section>
    );
  };

  const weeklySchedule = buildWeeklySchedule(profile, entry);
  const todaySchedule = weeklySchedule.find((d) => d.date === new Date().toISOString().slice(0, 10));
  const mainShift = todaySchedule?.shift ?? weeklySchedule.find((d) => d.shift)?.shift;
  const mainEmployee = todaySchedule?.employee ?? weeklySchedule.find((d) => d.employee)?.employee;

  if (pLoading || !loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen transition-colors ${
        uiTheme.mode === "dark"
          ? "bg-[radial-gradient(circle_at_10%_10%,#1f2937_0,#111827_38%,#0b1120_100%)] text-slate-100"
          : "bg-[radial-gradient(circle_at_10%_10%,#dff0ff_0,#f6fbff_28%,#f8fafc_60%),linear-gradient(135deg,#eef7ff,#fff7fb)] text-slate-900"
      }`}
    >
      {checkinCards.length > 0 && !checkinMessagesDismissed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/70 bg-white p-6 text-center shadow-[0_30px_100px_rgba(15,23,42,.35)]">
            <button
              type="button"
              onClick={() => setCheckinMessagesDismissed(true)}
              className="absolute right-4 top-4 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-500 hover:text-slate-900"
            >
              Cerrar
            </button>
            <div className="mb-4 text-left">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Vista al fichar</div>
              <h2 className="mt-1 text-2xl font-black text-slate-950">Comunicados para tu jornada</h2>
              <p className="text-sm text-slate-500">Mensajes automáticos y comunicados activos antes de registrar tu jornada.</p>
            </div>
            <div className="grid gap-3">
              {checkinCards.map((card) => (
                <div
                  key={card.id}
                  className="rounded-[1.5rem] border p-5 text-center"
                  style={{
                    background: card.style.background,
                    borderColor: card.style.border,
                    color: card.style.text,
                    fontFamily: card.style.fontFamily,
                    textAlign: card.style.align as any,
                  }}
                >
                  <div className="text-4xl">{card.icon}</div>
                  <h3
                    className="mt-2 text-2xl font-black"
                    style={{ fontWeight: card.style.bold ? 900 : 700, fontStyle: card.style.italic ? "italic" : "normal" }}
                  >
                    {card.title}
                  </h3>
                  <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed" style={{ fontSize: card.style.bodySize }}>
                    {card.body}
                  </p>
                </div>
              ))}
            </div>
            <Button className="mt-5 rounded-2xl bg-slate-950 px-6 text-white hover:bg-slate-800" onClick={() => setCheckinMessagesDismissed(true)}>
              Empezar mi jornada
            </Button>
          </div>
        </div>
      )}
      <div className={`sticky top-0 z-[80] border-b shadow-sm backdrop-blur-xl ${uiTheme.mode === "dark" ? "border-slate-700 bg-slate-950/92" : "border-blue-100/80 bg-white/92"}`}>
        <header id="grupmar-home-fixed-header" className="fixed left-0 right-0 top-[30px] z-[2147482999] h-16 border-b border-slate-200/80 bg-white/95 shadow-sm backdrop-blur-xl [&_.gmt-top-brand-logo]:!h-10 [&_.gmt-top-brand-logo]:!max-w-[145px] [&_img]:max-h-10 [&_a]:!py-2 [&_button]:!py-2">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <a href="/" className="flex items-center gap-3" aria-label="grup mar.time">
              <img
                src="/grupmar-time-brand.png"
                alt="grup mar.time"
                className="h-11 w-auto max-w-[178px] object-contain object-left"
              />
            </a>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <a href="/news" className="relative inline-flex items-center gap-1">Noticias<span className="sr-only">HOME_NEWS_RED_DOT_V58</span>{hasUnreadNews ? <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-600 ring-2 ring-white" title="Hay noticias nuevas" /> : null}</a>
              </Button>
            {canOpenShifts ? (
              <Button variant="outline" asChild>
                <a href="/admin/shifts">Turnos</a>
              </Button>
            ) : null}
            {canOpenAdminPanel ? (
              <Button variant="outline" asChild>
                <a href="/admin">Panel administrador</a>
              </Button>
            ) : null}
              <Button variant="ghost" size="sm" onClick={signOut}>
                <LogOut className="w-4 h-4 mr-1" /> Salir
              </Button>
            </div>
          </div>
        </header>
        <div id="grupmar-home-fixed-header-spacer" className="h-[96px]" aria-hidden="true" />

        {/* FASE_1_3A_HOME_INLINE_TICKER_DISABLED_KEEP_DB_CANONICAL */}
        {false && companyTickerItems.length > 0 && (
          <section className={`border-t ${uiTheme.mode === "dark" ? "border-slate-700 bg-slate-900/88" : "border-sky-100/80 bg-sky-50/72"}`}>
            <style>{`@keyframes grupmarTickerMove { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>
            <div className="mx-auto max-w-6xl px-4 py-2">
              {companyTickerItems.map((item) => {
                const speedClass = item.speed === "slow" ? "46s" : item.speed === "fast" ? "18s" : item.speed === "static" ? "0s" : "30s";
                const tickerText = `${item.icon} ${item.title}: ${item.body}`;
                return (
                  <div key={item.id} className="overflow-hidden rounded-2xl border px-3 py-2 shadow-sm" style={{ background: item.background, borderColor: item.border, color: item.text, fontFamily: item.fontFamily }}>
                    <div className="flex items-center gap-3">
                      <div className="shrink-0 rounded-xl px-2 py-1 text-xs font-black" style={{ background: item.accent, color: "white" }}>Comunicado</div>
                      <div className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-sm font-semibold">
                        <div
                          className={item.speed === "static" ? "inline-block" : "inline-flex min-w-max gap-12"}
                          style={{ animation: item.speed === "static" ? "none" : `grupmarTickerMove ${speedClass} linear infinite` }}
                        >
                          <span>{tickerText}</span>
                          {item.speed !== "static" && <span aria-hidden="true">{tickerText}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-8">
        <Alert hidden data-home-tech-banner-hidden="HOME_TECH_BANNER_HIDDEN_V56" className={`rounded-3xl shadow-sm backdrop-blur ${uiTheme.mode === "dark" ? "border-slate-700 bg-slate-900/70 text-slate-200" : "border-slate-200 bg-white/75 text-slate-700"}`}>
          <Sparkles className="w-4 h-4" />
          <AlertTitle>{PASTEL_HOME_VERSION}</AlertTitle>
          <AlertDescription>{ACCESS_SECURITY_VERSION}. Diseño pastel aplicado. El turno semanal asignado se muestra debajo del saludo y se adapta a móvil.</AlertDescription>
        </Alert>
        <ThemePaletteControl
          open={themePanelOpen}
          setOpen={setThemePanelOpen}
          paletteKey={uiTheme.palette}
          mode={uiTheme.mode}
          onPalette={(paletteKey) => setUiTheme((prev) => ({ ...prev, palette: paletteKey }))}
          onMode={() => setUiTheme((prev) => ({ ...prev, mode: prev.mode === "dark" ? "light" : "dark" }))}
        />
        <style>{`
          @keyframes gmtCandleDance {
            0%, 100% { transform: translateY(0) rotate(-3deg); }
            25% { transform: translateY(-3px) rotate(3deg); }
            50% { transform: translateY(1px) rotate(-2deg); }
            75% { transform: translateY(-2px) rotate(2deg); }
          }
          @keyframes gmtFlame {
            0%, 100% { transform: scale(1); opacity: .92; }
            50% { transform: scale(1.18); opacity: 1; }
          }
          .gmt-candle-dance { animation: gmtCandleDance 1.4s ease-in-out infinite; transform-origin: bottom center; }
          .gmt-flame { animation: gmtFlame .8s ease-in-out infinite; transform-origin: bottom center; }
        `}</style>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950">{greeting}, {profile?.full_name?.split(" ")[0]}</h1>
            <p className="text-slate-500">{new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
          <button
            type="button"
            onClick={resetModules}
            className="w-fit rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-xs font-black text-slate-600 shadow-sm"
          >
            Restaurar orden
          </button>
        </div>

        <Card className="rounded-[2rem] border border-sky-100 bg-white/88 px-4 py-3 shadow-[0_12px_30px_rgba(31,60,112,.06)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <button
              type="button"
              onClick={() => setCustomizerOpen((v) => !v)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-2xl border border-sky-100 bg-sky-50 text-sky-700 shadow-sm">
                {customizerOpen ? "−" : "+"}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-black text-slate-900">Personalizar mi panel</span>
                <span className="block truncate text-xs text-slate-500">
                  {customizerOpen ? "Marca o desmarca módulos. Al cerrar, este panel queda limpio." : "Mostrar selector de módulos"}
                </span>
              </span>
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-800">{visibleModules.length}/{DEFAULT_MODULE_ORDER.length} visibles</Badge>
              <button type="button" onClick={() => setCustomizerOpen((v) => !v)} className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black text-sky-800 shadow-sm">
                {customizerOpen ? "Cerrar selector" : "Configurar"}
              </button>
              {customizerOpen && (
                <>
                  <button type="button" onClick={showAllModules} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 shadow-sm">Mostrar todo</button>
                  <button type="button" onClick={hideAllModules} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 shadow-sm">Ocultar todo</button>
                </>
              )}
            </div>
          </div>
          {customizerOpen && (
            <div className="mt-3 rounded-3xl border border-sky-100 bg-sky-50/35 p-3">
              <div className="mb-2 text-xs font-semibold text-slate-500">Módulos disponibles</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {DEFAULT_MODULE_ORDER.map((id) => {
                  const checked = visibleModules.includes(id);
                  return (
                    <label
                      key={id}
                      className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 text-sm font-black shadow-sm transition ${checked ? "border-sky-200 bg-white text-slate-900" : "border-slate-200 bg-white/70 text-slate-500 opacity-75"}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleModuleVisibility(id)}
                        className="h-4 w-4 accent-sky-500"
                      />
                      <span className="min-w-0 truncate">{MODULE_LABELS[id]}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-5">
        <ModuleFrame id="celebrations" title={MODULE_LABELS.celebrations}>
        <Card className={`overflow-hidden rounded-[2rem] border p-5 shadow-[0_18px_45px_rgba(31,60,112,.08)] ${
          uiTheme.mode === "dark" ? "border-slate-700 bg-slate-900/88 text-slate-100" : "border-amber-100 bg-white/88 text-slate-900"
        }`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-2xl shadow-sm">
                <span className="gmt-candle-dance">🎂</span>
              </div>
              <div>
                <div className="text-sm font-black text-amber-600">Hoy en Grupo Marport</div>
                {effectiveTodayCelebrations.birthdays.length ? (
                  <div>
                    <div className="text-lg font-black">
                      Cumpleaños: {effectiveTodayCelebrations.birthdays.map((b) => b.full_name).join(", ")}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      No te olvides de felicitar{effectiveTodayCelebrations.birthdays.length > 1 ? "los" : "lo/la"} 🎉
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-lg font-black">Sin cumpleaños registrados hoy</div>
                    <div className="text-[11px] text-slate-500">
                      Próximos: {upcomingBirthdays.slice(0, 3).map((b) => `${b.full_name} (${prettyMMDD(b.date_mmdd)})`).join(" · ") || "no hay próximos en 14 días"}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[420px]">
              <div className="rounded-2xl border border-slate-100 bg-white/70 p-3">
                <div className="text-xs font-black text-slate-500">Festivos hoy</div>
                <div className="text-sm font-black text-slate-900">
                  {effectiveTodayCelebrations.holidays.map((h) => h.name).join(", ") || "Ninguno"}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white/70 p-3">
                <div className="text-xs font-black text-slate-500">Santos / santoral</div>
                <div className="text-sm font-black text-slate-900">
                  {mySaintToday ? `🎉 Hoy es tu santo: ${profile?.full_name?.split(" ")[0]}` : effectiveTodayCelebrations.saints.map((s) => s.names).join(", ") || "Sin dato"}
                </div>
                {mySaintToday && <div className="mt-1 text-xs font-bold text-violet-700">Felicidades, a compartirlo con el equipo ✨</div>}
              </div>
            </div>
          </div>
        </Card>
        </ModuleFrame>

        <ModuleFrame id="news" title={MODULE_LABELS.news}>
        <Card className={`overflow-hidden rounded-[2rem] border p-5 shadow-[0_18px_45px_rgba(31,60,112,.08)] ${uiTheme.mode === "dark" ? "border-slate-700 bg-slate-900/88 text-slate-100" : "border-slate-200/80 bg-white/90 text-slate-900"}`}>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-black text-sky-700">Informativo interno</div>
              <h2 className="text-lg font-black">Noticias, eventos y actualizaciones de la empresa</h2>
              <p className="text-xs text-slate-500">Publicado por administración/marketing. Nada de boca en boca: información centralizada y visible.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="w-fit rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-800 hover:bg-sky-50">{internalNews.length} publicaciones</Badge>
              <Button asChild size="sm" variant="outline" className="rounded-full border-sky-200 bg-white/80 text-sky-800 hover:bg-sky-50">
                <a href="/news">Leer todas</a>
              </Button>
            </div>
          </div>
          {internalNews.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {internalNews.map((item) => (
                <article key={item.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                  {item.imageUrl && <img src={item.imageUrl} alt={item.title} className="h-32 w-full object-cover" />}
                  <div className="p-4" style={{ background: item.background, color: item.textColor, fontFamily: item.fontFamily }}>
                    <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] opacity-70">
                      <span>{item.icons?.join(" ") || item.icon || "📰"}</span>
                      <span>{item.category}</span>
                    </div>
                    <h3 className="text-base font-black">{item.title}</h3>
                    <p className="mt-1 text-sm font-semibold opacity-85">{item.summary}</p>
                    <p className="mt-3 whitespace-pre-line text-sm leading-relaxed opacity-90">{item.body}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 p-5 text-sm font-semibold text-slate-500">
              No hay noticias internas publicadas para ti en este momento.
            </div>
          )}
        </Card>
        </ModuleFrame>

        <ModuleFrame id="schedule" title={MODULE_LABELS.schedule}>
        <Card className={`overflow-hidden rounded-[2rem] p-0 shadow-[0_18px_45px_rgba(31,60,112,.08)] backdrop-blur ${uiTheme.mode === "dark" ? "border-slate-700 bg-slate-900/88" : "border-slate-200/80 bg-white/88"}`}>
          <div className="flex flex-col gap-4 border-b border-slate-100 p-5 md:flex-row md:items-center md:justify-between" style={{ background: `linear-gradient(90deg, ${palette.headerFrom}, ${uiTheme.mode === "dark" ? "#111827" : "#ffffff"}, ${palette.headerTo})` }}>
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#111111] text-white shadow-lg shadow-slate-200">
                <CalendarDays className="h-6 w-6" />
              </div>
              <div>
                <div className="text-sm font-black tracking-[0.03em] text-slate-500">Mi turno de hoy</div>
                <h2 className="text-2xl font-black text-slate-950">{mainShift?.name ?? "Turno no configurado"}</h2>
                <p className="text-[11px] text-slate-500">
                  {todaySchedule?.date ? `${prettyDateLocal(todaySchedule.date)} · ` : ""}{mainEmployee?.center ? `Centro: ${mainEmployee.center}` : "Centro no definido"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="rounded-full px-3 py-1.5" style={{ backgroundColor: palette.badgeBg, color: palette.badgeText }}>
                <CalendarCheck2 className="mr-1 h-3.5 w-3.5" />
                Asignado
              </Badge>
              <Badge className="rounded-full px-3 py-1.5" style={{ backgroundColor: palette.badgeBg, color: palette.badgeText }}>
                Tolerancia {mainShift?.tolerance_minutes ?? entry?.late_tolerance_minutes ?? 10} min
              </Badge>
              <Badge className="rounded-full px-3 py-1.5" style={{ backgroundColor: palette.badgeBg, color: palette.badgeText }}>
                Salida +{mainShift?.exit_grace_minutes ?? entry?.exit_grace_minutes ?? 10} min
              </Badge>
            </div>
          </div>

          <div className="p-3">
            <div
              className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 shadow-sm ${
                todaySchedule?.shift ? "text-slate-950" : uiTheme.mode === "dark" ? "border-slate-700 bg-slate-900 text-slate-500" : "border-slate-200 bg-white text-slate-400"
              }`}
              style={todaySchedule?.shift ? { backgroundColor: palette.shiftBg, borderColor: palette.shiftBorder } : undefined}
            >
              <div className="w-16 shrink-0">
                <div className="text-sm font-black">{todaySchedule?.label ?? "Hoy"}</div>
                <div className="text-[11px] opacity-70">{prettyDateLocal(todaySchedule?.date)}</div>
              </div>

              <div className="min-w-0 flex-1">
                {todaySchedule?.shift ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <div className="text-xl font-black leading-none">{todaySchedule.shift.start_time?.slice(0, 5)} - {todaySchedule.shift.end_time?.slice(0, 5)}</div>
                    <div className="text-xs font-bold opacity-80">{todaySchedule.shift.name}</div>
                    {todaySchedule.shift.lunch_start_time && todaySchedule.shift.lunch_end_time && (
                      <div className="rounded-full bg-white/70 px-2 py-1 text-[11px]">
                        Almuerzo {todaySchedule.shift.lunch_start_time.slice(0, 5)} - {todaySchedule.shift.lunch_end_time.slice(0, 5)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm font-black opacity-70">Día libre</div>
                )}
              </div>

              <span className="shrink-0 rounded-full bg-white/80 px-2 py-1 text-[10px] font-black">Hoy</span>
            </div>
          </div>

          <div className="border-t border-slate-100 bg-white/72 px-3 py-2.5">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl p-2.5" style={{ backgroundColor: palette.summaryBg }}>
                <div className="text-xs font-bold text-slate-500">Horario base</div>
                <div className="text-base font-black text-slate-950">{mainShift?.start_time?.slice(0, 5) ?? "-"} - {mainShift?.end_time?.slice(0, 5) ?? "-"}</div>
              </div>
              <div className="rounded-xl p-2.5" style={{ backgroundColor: palette.summaryBg }}>
                <div className="text-xs font-bold text-slate-500">Almuerzo</div>
                <div className="text-base font-black text-slate-950">{mainShift?.lunch_start_time?.slice(0, 5) ?? "-"} - {mainShift?.lunch_end_time?.slice(0, 5) ?? "-"}</div>
              </div>
              <div className="rounded-xl p-2.5" style={{ backgroundColor: palette.summaryBg }}>
                <div className="text-xs font-bold text-slate-500">Centro</div>
                <div className="text-base font-black text-slate-950">{mainEmployee?.center ?? "Son Oms"}</div>
              </div>
              <div className="rounded-xl p-2.5" style={{ backgroundColor: palette.summaryBg }}>
                <div className="text-xs font-bold text-slate-500">Responsabilidad</div>
                <div className="text-base font-black text-slate-950">Fichar entrada/salida</div>
              </div>
            </div>
          </div>
        </Card>
        </ModuleFrame>

        {markingDisabled ? (
          <Alert className="rounded-[1.5rem] border-2 border-red-300 bg-red-50 text-red-700 shadow-sm">
            <ShieldX className="w-5 h-5 text-red-600" />
            <AlertTitle className="text-red-700">No puedes marcar aún tus marcaciones</AlertTitle>
            <AlertDescription className="font-semibold text-red-700">
              {entry?.message || markingWindowMessage}
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <ModuleFrame id="summary" title={MODULE_LABELS.summary}>
            <div className="grid gap-3 md:grid-cols-3">
              <Card className={`rounded-[1.45rem] border bg-white/90 p-4 shadow-[0_10px_24px_rgba(31,60,112,.06)] border-l-4 ${clientIsLate ? "border-l-destructive" : displayEntryTime ? "border-l-success" : "border-l-muted"}`}>
                <div className="text-sm text-muted-foreground">Entrada registrada</div>
                <div className="text-3xl font-black tracking-tight">{formatTime(displayEntryTime)}</div>
                {entry?.expected_time && (
                  <div className="mt-1 text-xs text-muted-foreground">Turno inicia a las {entry.expected_time.slice(0, 5)}</div>
                )}
                <div className="mt-2">
                  {clientIsLate ? (
                    <Badge className="bg-destructive text-destructive-foreground">Tardanza</Badge>
                  ) : displayEntryTime ? (
                    <Badge className="bg-success text-success-foreground">A tiempo</Badge>
                  ) : (
                    <Badge variant="outline">Sin entrada</Badge>
                  )}
                </div>
              </Card>

              <Card className="rounded-[1.45rem] border bg-white/90 p-4 shadow-[0_10px_24px_rgba(31,60,112,.06)] border-l-4 border-l-blue-400">
                <div className="text-sm text-muted-foreground">Salida final</div>
                <div className="text-3xl font-black tracking-tight">{formatTime(displayExitTime)}</div>
                {entry?.shift_end_time && (
                  <div className="mt-1 text-xs text-muted-foreground">Turno termina a las {entry.shift_end_time.slice(0, 5)}</div>
                )}
                {actualExit?.requires_admin_review && <Badge className="mt-3 bg-warning text-warning-foreground">Requiere revisión</Badge>}
              </Card>

              <Card className="rounded-[1.45rem] border bg-white/90 p-4 shadow-[0_10px_24px_rgba(31,60,112,.06)] border-l-4 border-l-violet-400">
                <div className="text-sm text-muted-foreground">Horas trabajadas hoy</div>
                <div className="text-3xl font-black tracking-tight">{fmtMinutes(netWorkedMinutes)}</div>
                <div className="text-xs text-muted-foreground mt-1">Objetivo turno: {fmtMinutes(targetNetMinutes)} · Progreso: {jornadaProgress}%</div>
              </Card>
            </div>

            <Card className="rounded-[1.5rem] border-slate-200 bg-white/90 p-4 shadow-[0_10px_24px_rgba(31,60,112,.06)]">
              <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-base font-black text-slate-950">Detalle de jornada y almuerzo</h2>
                  <p className="text-[11px] text-slate-500">Resumen en vivo de entrada, almuerzo, retorno y tiempo restante de jornada.</p>
                </div>
                <Badge className="w-fit rounded-full bg-slate-100 px-3 py-1.5 text-slate-700 hover:bg-slate-100">
                  {lunchStart ? (lunchEnd ? "Almuerzo cerrado" : "Almuerzo en curso") : "Almuerzo pendiente"}
                </Badge>
              </div>

              <div className="grid gap-3 md:grid-cols-5">
                <div className="rounded-2xl border border-slate-200 bg-[#f8fafc] p-3">
                  <div className="text-xs font-bold text-slate-500">Entrada</div>
                  <div className="mt-1 text-lg font-black text-slate-950">{formatTime(displayEntryTime)}</div>
                  <div className="mt-1 text-xs text-slate-500">Inicio real de jornada</div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-[#f8fafc] p-3">
                  <div className="text-xs font-bold text-slate-500">Inicio almuerzo</div>
                  <div className="mt-1 text-lg font-black text-slate-950">{formatTime(lunchStart?.event_time)}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {beforeLunchMinutes !== null ? `Desde entrada: ${fmtMinutes(beforeLunchMinutes)}` : "Pendiente"}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-[#f8fafc] p-3">
                  <div className="text-xs font-bold text-slate-500">Fin almuerzo</div>
                  <div className="mt-1 text-lg font-black text-slate-950">{formatTime(lunchEnd?.event_time)}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {lunchOpenMinutes !== null ? `En curso: ${fmtMinutes(lunchOpenMinutes)}` : lunchEnd ? "Retorno registrado" : "Pendiente"}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-[#f8fafc] p-3">
                  <div className="text-xs font-bold text-slate-500">Tiempo almuerzo</div>
                  <div className="mt-1 text-lg font-black text-slate-950">
                    {lunchOpenMinutes !== null ? fmtMinutes(lunchOpenMinutes) : fmtMinutes(lunchMinutes)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">Consumido acumulado</div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-[#f8fafc] p-3">
                  <div className="text-xs font-bold text-slate-500">Después de almuerzo</div>
                  <div className="mt-1 text-lg font-black text-slate-950">{afterLunchMinutes !== null ? fmtMinutes(afterLunchMinutes) : "-"}</div>
                  <div className="mt-1 text-xs text-slate-500">Retorno → salida/ahora</div>
                </div>
              </div>

              <div className="mt-3 rounded-3xl border border-slate-200 bg-white p-4">
                <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-500">
                  <span>Distribución de la jornada</span>
                  <span>Neto: {fmtMinutes(netWorkedMinutes)}</span>
                </div>
                <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="bg-slate-700"
                    style={{ width: `${Math.min(100, grossWorkedMinutes ? ((beforeLunchMinutes ?? grossWorkedMinutes) / Math.max(grossWorkedMinutes, 1)) * 100 : 0)}%` }}
                    title="Trabajo antes del almuerzo"
                  />
                  <div
                    className="bg-slate-300"
                    style={{ width: `${Math.min(100, grossWorkedMinutes ? ((lunchOpenMinutes ?? lunchMinutes) / Math.max(grossWorkedMinutes, 1)) * 100 : 0)}%` }}
                    title="Almuerzo"
                  />
                  <div
                    className="bg-slate-500"
                    style={{ width: `${Math.min(100, grossWorkedMinutes ? ((afterLunchMinutes ?? 0) / Math.max(grossWorkedMinutes, 1)) * 100 : 0)}%` }}
                    title="Trabajo después del almuerzo"
                  />
                </div>
                <div className="mt-2 grid gap-2 text-xs text-slate-500 md:grid-cols-3">
                  <div><span className="inline-block h-2 w-2 rounded-full bg-slate-700" /> Antes almuerzo: {beforeLunchMinutes !== null ? fmtMinutes(beforeLunchMinutes) : "-"}</div>
                  <div><span className="inline-block h-2 w-2 rounded-full bg-slate-300" /> Almuerzo: {lunchOpenMinutes !== null ? fmtMinutes(lunchOpenMinutes) : fmtMinutes(lunchMinutes)}</div>
                  <div><span className="inline-block h-2 w-2 rounded-full bg-slate-500" /> Después almuerzo: {afterLunchMinutes !== null ? fmtMinutes(afterLunchMinutes) : "-"}</div>
                </div>
              </div>
            </Card>

            {clientIsLate && displayEntryTime && (
              <Alert variant="destructive">
                <AlertTriangle className="w-4 h-4" />
                <AlertTitle>Usted ha llegado tarde</AlertTitle>
                <AlertDescription>
                  Tardanza total: {clientLateTotal} min · Fuera de tolerancia: {clientLateAfterTolerance} min.
                  Evite llegar tarde continuamente. La acumulación de tardanzas puede generar medidas laborales internas.
                </AlertDescription>
              </Alert>
            )}
            </ModuleFrame>

            <ModuleFrame id="security" title={MODULE_LABELS.security}>
            <Card className={`rounded-[2rem] border-0 p-4 shadow-[0_14px_32px_rgba(31,60,112,.08)] flex items-center gap-3 ${locBadge.cls}`}>
              <NetIcon className="w-5 h-5" />
              <div className="flex-1">
                <div className="font-medium">{locBadge.label}</div>
                <div className="text-xs opacity-80">IP detectada: {entry?.ip_address || "no detectada"}</div>
              </div>
            </Card>

            <Card className={`rounded-[2rem] bg-white/90 shadow-[0_14px_32px_rgba(31,60,112,.08)] p-4 border-l-4 ${accessSnapshot?.risk_level === "low" ? "border-l-green-500" : "border-l-red-500"}`}>
              <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
                <div>
                  <div className="text-sm text-muted-foreground">Control de acceso remoto / ubicación</div>
                  <div className="text-xl font-bold flex items-center gap-2">
                    <RiskIcon level={accessSnapshot?.risk_level} />
                    {accessBusy ? "Capturando ubicación..." : riskLabel(accessSnapshot?.risk_level)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    IP: {accessSnapshot?.ip_address ?? entry?.ip_address ?? "no detectada"} · GPS: {accessSnapshot?.latitude?.toFixed(6) ?? "-"}, {accessSnapshot?.longitude?.toFixed(6) ?? "-"} · Precisión: {accessSnapshot?.accuracy ? `${accessSnapshot.accuracy} m` : "-"}
                  </div>
                  <div className="text-xs mt-1 font-medium text-destructive">
                    {accessSnapshot?.risk_reason ?? "Pendiente de captura. Si el usuario deniega GPS, quedará marcado en rojo."}
                  </div>
                </div>
                <Badge className={riskClasses(accessSnapshot?.risk_level)}>{riskLabel(accessSnapshot?.risk_level)}</Badge>
              </div>
              <div
                className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
                onWheelCapture={(ev) => {
                  if (!ev.ctrlKey && !ev.metaKey) {
                    ev.stopPropagation();
                  }
                }}
              >
                <div className={mapInteractionEnabled ? "pointer-events-auto" : "pointer-events-none"}>
                  {stableAccessMap}
                </div>
                {!mapInteractionEnabled && (
                  <div className="pointer-events-none absolute inset-x-3 top-3 rounded-2xl border border-white/70 bg-white/90 px-3 py-2 text-xs font-black text-slate-700 shadow-lg backdrop-blur">
                    Mapa bloqueado para que el scroll no lo mueva. Mantén Ctrl presionado para mover/zoom.
                  </div>
                )}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Mapa fijo por defecto. Para interactuar con el mapa: mantén <strong>Ctrl</strong> presionado y luego usa el ratón/zoom. En móvil queda como mapa de solo lectura.
              </div>
            </Card>

            {lastNotice && (
              <Alert className="border-warning bg-warning/10">
                <AlertTriangle className="w-4 h-4" />
                <AlertTitle>Incidencia registrada</AlertTitle>
                <AlertDescription>{lastNotice}</AlertDescription>
              </Alert>
            )}
            </ModuleFrame>

            <ModuleFrame id="alerts" title={MODULE_LABELS.alerts}>
            {lunchOutsideWindow && lunchNotStarted && !!displayEntryTime && !exited && (
              <Alert className="rounded-3xl border-amber-200 bg-amber-50/80 text-amber-950">
                <UtensilsCrossed className="w-4 h-4" />
                <AlertTitle>Almuerzo fuera de la franja prevista</AlertTitle>
                <AlertDescription>
                  Puede marcarlo igualmente si estuvo en reunión, operación o no pudo salir a la hora. La marcación quedará registrada con observación para revisión/regularización.
                </AlertDescription>
              </Alert>
            )}

            {isEarlyExit && !!displayEntryTime && !systemClosed && (
              <Alert className="border-warning bg-warning/10">
                <DoorClosed className="w-4 h-4" />
                <AlertTitle>Salida antes del horario</AlertTitle>
                <AlertDescription>
                  Si registra salida final antes de las {entry?.shift_end_time?.slice(0, 5)}, quedará como salida anticipada y se notificará al administrador.
                </AlertDescription>
              </Alert>
            )}

            {inPreEndNotice && (
              <Alert className="border-primary bg-primary/10">
                <Clock className="w-4 h-4" />
                <AlertTitle>Su jornada está por concluir</AlertTitle>
                <AlertDescription>
                  En menos de 10 minutos terminará su turno. Vaya guardando su trabajo, cerrando aplicaciones y dejando todo ordenado.
                  Gracias por su jornada; disfrute su tarde, su familia, la playa, sus planes personales o simplemente un buen descanso.
                </AlertDescription>
              </Alert>
            )}

            {inExitCountdown && (
              <Alert className="border-warning bg-warning/10">
                <Clock className="w-4 h-4" />
                <AlertTitle>Su jornada ha finalizado. Registre su salida.</AlertTitle>
                <AlertDescription>
                  Ya es hora de salida. Debe registrar su salida final. Tiempo máximo restante: <strong className="text-lg">{closeCountdown}</strong>.
                  Si no marca salida dentro de este margen, la jornada quedará sin salida registrada y podría generar revisión o posibles descuentos.
                </AlertDescription>
              </Alert>
            )}

            {systemClosed && (
              <Alert variant="destructive">
                <ShieldX className="w-4 h-4" />
                <AlertTitle>Sistema de marcaciones cerrado</AlertTitle>
                <AlertDescription>
                  Su jornada laboral ya finalizó. Podrá volver a registrar marcaciones en su siguiente jornada asignada.
                  Si olvidó registrar alguna marcación, contacte con su responsable.
                </AlertDescription>
              </Alert>
            )}
            </ModuleFrame>
          </>
        )}

        <ModuleFrame id="actions" title={MODULE_LABELS.actions}>
        <Card className="rounded-[2rem] bg-white/90 p-6 shadow-[0_14px_32px_rgba(31,60,112,.08)]">
          <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
            <div>
              <h2 className="font-semibold">Marcaciones del día</h2>
              <p className="text-xs text-muted-foreground mt-1">{lunchHint}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {entry?.lunch_start_time && entry?.lunch_end_time ? (
                <Badge variant="outline">Almuerzo previsto {entry.lunch_start_time.slice(0, 5)} - {entry.lunch_end_time.slice(0, 5)}</Badge>
              ) : (
                <Badge variant="outline">Almuerzo flexible / sin franja</Badge>
              )}
              {entry?.shift_end_time && <Badge variant="outline">Salida hasta {entry.shift_end_time.slice(0, 5)} + {exitGraceMinutes} min</Badge>}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <ActionButton
              label={
                openLunch ? "Almuerzo iniciado" :
                lunchOutsideWindow ? "Iniciar almuerzo con incidencia" :
                !lunchWindowConfigured ? "Iniciar almuerzo flexible" :
                "Iniciar almuerzo"
              }
              icon={UtensilsCrossed}
              onClick={() => trigger("LUNCH_START")}
              disabled={markingDisabled || !canStartLunchNow || busy !== null}
              busy={busy === "LUNCH_START"}
            />
            <ActionButton label="Fin de almuerzo" icon={PauseCircle} onClick={() => trigger("LUNCH_END")}
              disabled={markingDisabled || !openLunch || systemClosed || busy !== null} busy={busy === "LUNCH_END"} />
            <ActionButton label="Salida por permiso" icon={FileText} onClick={() => trigger("PERMISSION_START")}
              disabled={markingDisabled || !displayEntryTime || openPerm || exited || systemClosed || busy !== null} busy={busy === "PERMISSION_START"} />
            <ActionButton label="Retorno de permiso" icon={PlayCircle} onClick={() => trigger("PERMISSION_END")}
              disabled={markingDisabled || !openPerm || systemClosed || busy !== null} busy={busy === "PERMISSION_END"} />
            <ActionButton label="Salida extraordinaria" icon={DoorOpen} onClick={() => trigger("EXTRA_EXIT_START")}
              disabled={markingDisabled || !displayEntryTime || openExtra || exited || systemClosed || busy !== null} busy={busy === "EXTRA_EXIT_START"} />
            <ActionButton label="Retorno salida extra" icon={PlayCircle} onClick={() => trigger("EXTRA_EXIT_END")}
              disabled={markingDisabled || !openExtra || systemClosed || busy !== null} busy={busy === "EXTRA_EXIT_END"} />
            <ActionButton
              label={isEarlyExit ? "Salida final anticipada" : "Salida final"}
              icon={isEarlyExit ? AlertTriangle : DoorClosed}
              variant="destructive"
              onClick={() => setExitConfirmOpen(true)}
              disabled={markingDisabled || !displayEntryTime || blockExit || busy !== null}
              busy={busy === "EXIT"}
            />
          </div>
        </Card>
        </ModuleFrame>

        <ModuleFrame id="balance" title={MODULE_LABELS.balance}>
        <Card className={`rounded-[1.5rem] border p-4 shadow-[0_10px_24px_rgba(31,60,112,.06)] ${jornadaToneClass}`}>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/70">
                {jornadaStatus.tone === "ok" ? <ShieldCheck className="h-5 w-5" /> : jornadaStatus.tone === "danger" ? <AlertTriangle className="h-5 w-5" /> : <Timer className="h-5 w-5" />}
              </div>
              <div>
                <div className="text-xs font-black uppercase tracking-[0.16em] opacity-70">Balance de jornada</div>
                <h2 className="text-lg font-black">{jornadaStatus.title}</h2>
                <p className="mt-1 text-sm font-semibold opacity-90">{jornadaStatus.message}</p>
              </div>
            </div>
            <div className="rounded-2xl bg-white/75 px-4 py-2 text-center shadow-sm">
              <div className="text-xs font-black opacity-60">Trabajado</div>
              <div className="text-xl font-black">{fmtMinutes(netWorkedMinutes)}</div>
              <div className="mt-1 text-xs font-black">{jornadaStatus.pill}</div>
            </div>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/70">
            <div
              className={jornadaStatus.tone === "danger" ? "h-full bg-rose-500" : jornadaStatus.tone === "ok" ? "h-full bg-emerald-500" : "h-full bg-sky-500"}
              style={{ width: `${jornadaProgress}%` }}
            />
          </div>
          <div className="mt-2 grid gap-1 text-[11px] font-bold opacity-80 md:grid-cols-4">
            <div>Objetivo turno: {fmtMinutes(targetNetMinutes)}</div>
            <div>Bruto: {fmtMinutes(grossWorkedMinutes)}</div>
            <div>Pausas: {fmtMinutes(nonWorkingMinutes)}</div>
            <div>Salida: {displayExitTime ? formatTime(displayExitTime) : "pendiente"}</div>
          </div>
        </Card>
        </ModuleFrame>

        <ModuleFrame id="events" title={MODULE_LABELS.events}>
        <Card className="rounded-[2rem] bg-white/90 p-6 shadow-[0_14px_32px_rgba(31,60,112,.08)]">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="font-semibold">Eventos registrados hoy</h2>
            <Badge className={jornadaStatus.tone === "ok" ? "bg-emerald-600 text-white" : jornadaStatus.tone === "danger" ? "bg-rose-600 text-white" : "bg-sky-600 text-white"}>
              {jornadaStatus.pill}
            </Badge>
          </div>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin marcaciones aún.</p>
          ) : (
            <ul className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0 gap-3">
                  <div>
                    <span className="font-medium">{EVENT_LABEL[e.event_type] ?? e.event_type}</span>
                    {e.requires_admin_review && <Badge className="ml-2 bg-warning text-warning-foreground">Revisión</Badge>}
                    {e.lunch_window_status && e.lunch_window_status !== "not_applicable" && e.lunch_window_status !== "inside_window" && (
                      <Badge className="ml-2 bg-warning text-warning-foreground">Almuerzo: {e.lunch_window_status}</Badge>
                    )}
                  </div>
                  <span className="text-muted-foreground whitespace-nowrap">{formatTime(e.event_time)} · {e.ip_address ?? "-"}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        </ModuleFrame>

        </div>

        <Card className="rounded-[2rem] bg-white/80 p-4 text-xs text-slate-500 shadow-sm flex items-start gap-2">
          <Timer className="w-4 h-4 mt-0.5" />
          <div>
            La hora de entrada es la primera marcación real del día y se mantiene fija. La hora actual solo se usa para calcular contadores y horas trabajadas en vivo.
          </div>
        </Card>

        {exitConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <Card className="w-full max-w-lg border-destructive/30 p-6 shadow-2xl">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-destructive/10 p-2 text-destructive">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold">¿Desea realmente registrar salida final?</h2>
                  {isEarlyExit ? (
                    <div className="mt-3 space-y-2 text-sm text-destructive">
                      <p className="font-semibold">Está intentando salir antes del horario de fin de turno.</p>
                      <p>Fin de turno esperado: <strong>{entry?.shift_end_time?.slice(0, 5) ?? "-"}</strong>.</p>
                      <p>Esta salida quedará como <strong>salida anticipada</strong>, se notificará al administrador y puede generar descuentos, regularización con supervisor y consecuencias laborales internas.</p>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Se registrará su salida final del día. Después de confirmar, no podrá seguir registrando eventos de la jornada.
                    </p>
                  )}
                  <div className="mt-6 flex justify-end gap-3">
                    <Button variant="outline" onClick={() => setExitConfirmOpen(false)} disabled={busy !== null}>Cancelar</Button>
                    <Button variant="destructive" onClick={async () => { setExitConfirmOpen(false); await trigger("EXIT"); }} disabled={busy !== null}>
                      Confirmar salida
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}


function ThemePaletteControl({
  open,
  setOpen,
  paletteKey,
  mode,
  onPalette,
  onMode,
}: {
  open: boolean;
  setOpen: (value: boolean) => void;
  paletteKey: UiPaletteKey;
  mode: UiThemeMode;
  onPalette: (paletteKey: UiPaletteKey) => void;
  onMode: () => void;
}) {
  return (
    <div className="fixed right-3 top-1/2 z-40 -translate-y-1/2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white/90 text-slate-700 shadow-lg backdrop-blur transition hover:scale-105 hover:bg-white"
        title="Paleta y tema"
      >
        <Palette className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-11 top-1/2 w-[230px] -translate-y-1/2 rounded-3xl border border-slate-200 bg-white/96 p-3 text-slate-900 shadow-2xl backdrop-blur-xl">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-[13px] font-black">Apariencia</div>
              <div className="text-[11px] text-slate-500">Se guarda en cookie</div>
            </div>
            <button
              type="button"
              onClick={onMode}
              className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-700"
              title={mode === "dark" ? "Cambiar a claro" : "Cambiar a oscuro"}
            >
              {mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(UI_PALETTES) as UiPaletteKey[]).map((key) => {
              const p = UI_PALETTES[key];
              const selected = key === paletteKey;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onPalette(key)}
                  className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-left text-xs font-bold transition hover:-translate-y-0.5 ${
                    selected ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white"
                  }`}
                >
                  <span className="h-5 w-5 rounded-full border border-black/10" style={{ backgroundColor: p.dot }} />
                  <span className="flex-1">{p.name}</span>
                  {selected && <Check className="h-3.5 w-3.5" />}
                </button>
              );
            })}
          </div>

          <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
            La paleta cambia los turnos y se conserva al volver a iniciar.
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({ label, icon: Icon, onClick, disabled, busy, variant = "secondary" as const }: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: "secondary" | "destructive";
}) {
  return (
    <Button variant={variant} size="lg" disabled={disabled} onClick={onClick}
      className={`h-auto rounded-3xl py-4 flex-col gap-2 whitespace-normal shadow-sm ${
        variant === "destructive"
          ? "bg-rose-500 hover:bg-rose-600 text-white"
          : "bg-[#edf7fb] hover:bg-[#e1f0f7] text-slate-800 border border-slate-100"
      }`}>
      {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Icon className="w-5 h-5" />}
      <span className="text-sm">{label}</span>
    </Button>
  );
}







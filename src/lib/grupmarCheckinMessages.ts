import { supabase } from "@/integrations/supabase/client";
export type CheckinTargetMode = "all" | "employee" | "center" | "department";
export type CheckinMessageType = "birthday" | "saint" | "promotion" | "responsibility" | "recognition" | "welcome" | "farewell" | "condolence" | "trip" | "custom";

export type CheckinMessageStyle = {
  icon: string;
  background: string;
  border: string;
  text: string;
  accent: string;
  fontFamily: string;
  fontWeight?: string;
  fontStyle?: string;
  textDecoration?: string;
  titleSize: number;
  bodySize: number;
  bold: boolean;
  italic: boolean;
  align: "left" | "center" | "right";
};

export type CheckinTemplate = {
  enabled: boolean;
  icon: string;
  title: string;
  body: string;
  style: CheckinMessageStyle;
};

export type ManualCheckinMessage = {
  id: string;
  enabled: boolean;
  type: CheckinMessageType;
  name: string;
  title: string;
  body: string;
  targetMode: CheckinTargetMode;
  targetValue: string;
  subjectEmployeeId?: string;
  subjectName?: string;
  subjectEmail?: string;
  subjectCenter?: string;
  subjectDepartment?: string;
  startDate: string;
  endDate: string;
  style: CheckinMessageStyle;
};

export type CheckinMessageSettings = {
  automatic: {
    birthday: CheckinTemplate;
    saint: CheckinTemplate;
  };
  manual: ManualCheckinMessage[];
};

export type CheckinCard = {
  id: string;
  icon: string;
  title: string;
  body: string;
  style: CheckinMessageStyle;
};


export type CompanyTickerSpeed = "slow" | "normal" | "fast" | "static";
export type CompanyTickerPublishMode = "default24h" | "custom";

export type CompanyTickerMessage = {
  id: string;
  enabled: boolean;
  published: boolean;
  publishedAt: string;
  publishMode: CompanyTickerPublishMode;
  icon: string;
  endIcon?: string;
  badge?: string;
  title: string;
  body: string;
  targetMode: CheckinTargetMode;
  targetValue: string;
  subjectEmployeeId?: string;
  subjectName?: string;
  subjectEmail?: string;
  subjectCenter?: string;
  subjectDepartment?: string;
  startDate: string;
  endDate: string;
  background: string;
  border: string;
  text: string;
  accent: string;
  fontFamily: string;
  speed: CompanyTickerSpeed;
};

export type CompanyTickerSettings = {
  enabled: boolean;
  messages: CompanyTickerMessage[];
};

export const CHECKIN_MESSAGES_KEY = "grupmar_time_checkin_messages_v1";
export const COMPANY_TICKER_KEY = "grupmar_time_company_ticker_v1";

export const EMOJI_CATEGORIES = [
  { name: "Celebración", emojis: ["🎉", "🥳", "🎊", "✨", "🌟", "⭐", "🙌", "👏", "💫", "💙", "🩵", "✅"] },
  { name: "Cumpleaños", emojis: ["🎂", "🍰", "🧁", "🎁", "🎈", "🕯️", "🥂", "🍾", "🌹", "💐", "🎀", "🥰"] },
  { name: "Ascenso / logro", emojis: ["🏆", "🥇", "🚀", "📈", "💼", "👑", "🔥", "💪", "🫡", "🤝", "🎖️", "🏅"] },
  { name: "Responsabilidad", emojis: ["🧭", "📌", "📝", "📋", "🗂️", "🔑", "⚙️", "🛠️", "🧩", "📊", "👷", "🧑‍💼"] },
  { name: "Bienvenida", emojis: ["👋", "🤗", "🏡", "🌊", "☀️", "😊", "🫶", "🌈", "💙", "🛟", "🧭", "✨"] },
  { name: "Viajes / cambios", emojis: ["✈️", "🧳", "🗺️", "🚢", "⛵", "🚗", "📍", "🛫", "🌍", "🏝️", "🌅", "🧭"] },
  { name: "Salida / despedida", emojis: ["🤝", "👋", "💐", "🫶", "🙏", "🌟", "📦", "🚪", "🧳", "✨", "💙", "🥹"] },
  { name: "Condolencias", emojis: ["🕊️", "🕯️", "🤍", "🙏", "💐", "🌹", "🖤", "🌙", "✨", "🫂", "💌", "🤲"] },
  { name: "Avisos", emojis: ["📢", "⚠️", "ℹ️", "📌", "🔔", "📅", "🕒", "✅", "❗", "📄", "🔎", "🧾"] },
  { name: "RRHH / empresa", emojis: ["🏢", "👥", "🧑‍💼", "📣", "📍", "🕙", "🗓️", "🚌", "🍽️", "🏖️", "🎄", "🎅"] },
  { name: "Cambios de horario", emojis: ["⏰", "🕘", "🕙", "🕛", "⌛", "⏳", "📆", "🔁", "🚦", "✅", "⚠️", "📢"] },
];

export const EMOJI_OPTIONS = EMOJI_CATEGORIES.flatMap((category) => category.emojis);
export const FONT_OPTIONS = [
  "Arial",
  "Arial Black",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Segoe UI",
  "Calibri",
  "Cambria",
  "Georgia",
  "Times New Roman",
  "Garamond",
  "Palatino Linotype",
  "Book Antiqua",
  "Courier New",
  "Lucida Console",
  "Lucida Sans Unicode",
  "Impact",
  "Century Gothic",
  "Franklin Gothic Medium",
  "Gill Sans",
  "Helvetica",
  "Montserrat",
  "Poppins",
  "Roboto",
  "Inter",
  "Open Sans",
  "Lato",
  "Nunito",
  "Merriweather",
  "Playfair Display",
  "Bebas Neue",
  "Oswald",
  "Raleway",
  "Ubuntu",
  "Rubik",
  "Work Sans",
  "Source Sans Pro",
  "Noto Sans",
  "Quicksand",
  "Josefin Sans",
  "DM Sans",
  "Fira Sans",
  "PT Sans",
  "Aptos",
  "Consolas",
  "Candara",
  "Corbel",
  "Constantia",
  "Perpetua",
  "Rockwell"
];
export const PALETTE_OPTIONS = [
  { name: "Neutro elegante", background: "#F8FAFC", border: "#CBD5E1", text: "#0F172A", accent: "#0EA5E9" },
  { name: "Blanco limpio", background: "#FFFFFF", border: "#E2E8F0", text: "#0F172A", accent: "#0EA5E9" },
  { name: "Corporativo azul", background: "#EAF6FF", border: "#38BDF8", text: "#0F172A", accent: "#0284C7" },
  { name: "Azul noche premium", background: "#0F172A", border: "#38BDF8", text: "#F8FAFC", accent: "#0EA5E9" },
  { name: "Marino Grupo", background: "#E0F2FE", border: "#0369A1", text: "#082F49", accent: "#075985" },
  { name: "Cian tecnológico", background: "#ECFEFF", border: "#06B6D4", text: "#164E63", accent: "#0891B2" },
  { name: "Minimal cielo", background: "#F0F9FF", border: "#BAE6FD", text: "#0C4A6E", accent: "#0EA5E9" },
  { name: "Rojo urgente", background: "#FEF2F2", border: "#EF4444", text: "#7F1D1D", accent: "#DC2626" },
  { name: "Rojo alerta total", background: "#DC2626", border: "#991B1B", text: "#FFFFFF", accent: "#111827" },
  { name: "Ámbar importante", background: "#FFFBEB", border: "#F59E0B", text: "#78350F", accent: "#D97706" },
  { name: "Verde operativo", background: "#ECFDF3", border: "#22C55E", text: "#052E16", accent: "#16A34A" },
  { name: "Éxito suave", background: "#F0FDF4", border: "#86EFAC", text: "#14532D", accent: "#22C55E" },
  { name: "Violeta dirección", background: "#F5F3FF", border: "#8B5CF6", text: "#2E1065", accent: "#7C3AED" },
  { name: "Rosa comunicado", background: "#FFF1F2", border: "#FB7185", text: "#881337", accent: "#E11D48" },
  { name: "Grafito serio", background: "#111827", border: "#6B7280", text: "#F9FAFB", accent: "#374151" },
  { name: "San Juan", background: "#FFF7ED", border: "#FB923C", text: "#7C2D12", accent: "#EA580C" },
  { name: "Festivo", background: "#FEFCE8", border: "#EAB308", text: "#713F12", accent: "#CA8A04" },
  { name: "RRHH suave", background: "#FDF2F8", border: "#F472B6", text: "#831843", accent: "#DB2777" },
  { name: "Operaciones", background: "#F1F5F9", border: "#64748B", text: "#0F172A", accent: "#334155" },
  { name: "Seguridad", background: "#F8FAFC", border: "#0F172A", text: "#0F172A", accent: "#111827" }
];

export const DEFAULT_STYLE: CheckinMessageStyle = {
  icon: "🎉",
  background: "#FFF8D8",
  border: "#F4D06F",
  text: "#0F172A",
  accent: "#F59E0B",
  fontFamily: "Arial",
    fontWeight: "700",
    fontStyle: "normal",
    textDecoration: "none",
  titleSize: 26,
  bodySize: 14,
  bold: true,
  italic: false,
  align: "center",
};

export const DEFAULT_CHECKIN_SETTINGS: CheckinMessageSettings = {
  automatic: {
    birthday: {
      enabled: true,
      icon: "🎂",
      title: "¡Feliz cumpleaños, {nombre}!",
      body: "Hoy en Grupo Marport celebramos contigo. Que tengas un día lleno de alegría y buenos momentos.",
      style: { ...DEFAULT_STYLE, icon: "🎂", background: "#FFF8D8", border: "#F4D06F", accent: "#F59E0B" },
    },
    saint: {
      enabled: true,
      icon: "✨",
      title: "¡Feliz santo, {nombre}!",
      body: "Hoy celebramos tu santo. Que tengas un bonito día de parte del equipo de Grupo Marport.",
      style: { ...DEFAULT_STYLE, icon: "✨", background: "#F5F3FF", border: "#C4B5FD", accent: "#7C3AED" },
    },
  },  manual: [],
};

function mergeSettings(value: any): CheckinMessageSettings {
  return {
    automatic: {
      birthday: { ...DEFAULT_CHECKIN_SETTINGS.automatic.birthday, ...(value?.automatic?.birthday ?? {}), style: { ...DEFAULT_CHECKIN_SETTINGS.automatic.birthday.style, ...(value?.automatic?.birthday?.style ?? {}) } },
      saint: { ...DEFAULT_CHECKIN_SETTINGS.automatic.saint, ...(value?.automatic?.saint ?? {}), style: { ...DEFAULT_CHECKIN_SETTINGS.automatic.saint.style, ...(value?.automatic?.saint?.style ?? {}) } },
    },
    manual: Array.isArray(value?.manual) ? value.manual.map((m: any) => ({ ...newManualCheckinMessage(), ...m, style: { ...DEFAULT_STYLE, ...(m?.style ?? {}) } })) : DEFAULT_CHECKIN_SETTINGS.manual,
  };
}

let cachedCheckinSettings: CheckinMessageSettings = DEFAULT_CHECKIN_SETTINGS;

export async function loadCheckinMessageSettingsFromDb(): Promise<CheckinMessageSettings> {
  const { data, error } = await (supabase as any).rpc("gmt_get_checkin_config", {
    p_key: "checkin_messages",
  });

  if (error) {
    console.warn("[GrupMar Time] No se pudo cargar checkin_messages desde BD", error);
    return cachedCheckinSettings;
  }

  cachedCheckinSettings = mergeSettings(data || {});
  return cachedCheckinSettings;
}

export function readCheckinMessageSettings(): CheckinMessageSettings {
  return cachedCheckinSettings;
}

export function saveCheckinMessageSettings(settings: CheckinMessageSettings) {
  cachedCheckinSettings = mergeSettings(settings);

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("grupmar-checkin-settings-changed", {
        detail: cachedCheckinSettings,
      })
    );
  }

  void (supabase as any)
    .rpc("gmt_save_checkin_config", {
      p_key: "checkin_messages",
      p_settings: cachedCheckinSettings,
    })
    .then(({ error }: any) => {
      if (error) {
        console.error("[GrupMar Time] Error guardando checkin_messages en BD", error);
      }
    });
}

export function newManualCheckinMessage(): ManualCheckinMessage {
  return {
    id: `manual-${Date.now()}`,
    enabled: true,
    type: "custom",
    name: "Nuevo comunicado",
    title: "🌟 Mensaje especial",
    body: "Escribe aquí el mensaje que verá el trabajador al fichar.",
    targetMode: "all",
    targetValue: "",
    subjectEmployeeId: "",
    subjectName: "",
    subjectEmail: "",
    subjectCenter: "",
    subjectDepartment: "",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    style: { ...DEFAULT_STYLE },
  };
}

function fillTokens(text: string, profile: any, subject?: any) {
  const profileFullName = profile?.full_name || profile?.name || "compañero/a";
  const subjectFullName = subject?.full_name || subject?.name || subject?.subjectName || profileFullName;
  const subjectFirstName = String(subjectFullName).split(" ")[0] || subjectFullName;
  return String(text || "")
    .replaceAll("{nombre}", subjectFirstName)
    .replaceAll("{nombre_completo}", subjectFullName)
    .replaceAll("{destinatario}", subjectFirstName)
    .replaceAll("{destinatario_completo}", subjectFullName);
}

function manualMatches(message: ManualCheckinMessage, profile: any) {
  if (!message.enabled) return false;
  const today = new Date().toISOString().slice(0, 10);
  if (message.startDate && today < message.startDate) return false;
  if (message.endDate && today > message.endDate) return false;
  const target = String(message.targetValue || "").trim().toLowerCase();
  if (message.targetMode === "all") return true;
  if (!target) return false;
  if (message.targetMode === "employee") {
    return [profile?.id, profile?.email, profile?.full_name].some((x) => String(x || "").toLowerCase() === target);
  }
  if (message.targetMode === "center") return String(profile?.center || "").toLowerCase() === target;
  if (message.targetMode === "department") return String(profile?.department || "").toLowerCase() === target;
  return false;
}

export function buildCheckinCards(ctx: { profile: any; todayCelebrations?: any; myBirthdayToday?: any; mySaintToday?: any }, settings = readCheckinMessageSettings()): CheckinCard[] {
  const cards: CheckinCard[] = [];
  const profile = ctx.profile;
  const firstName = profile?.full_name?.split(" ")[0] || ctx.myBirthdayToday?.full_name?.split(" ")[0] || "compañero/a";

  if (ctx.myBirthdayToday && settings.automatic.birthday.enabled) {
    const t = settings.automatic.birthday;
    cards.push({
      id: "auto-birthday",
      icon: t.icon || t.style.icon || "🎂",
      title: fillTokens(t.title, { ...profile, full_name: profile?.full_name || ctx.myBirthdayToday.full_name || firstName }),
      body: fillTokens(t.body, { ...profile, full_name: profile?.full_name || ctx.myBirthdayToday.full_name || firstName }),
      style: { ...t.style, icon: t.icon || t.style.icon },
    });
  }

  if (!ctx.myBirthdayToday && ctx.mySaintToday && settings.automatic.saint.enabled) {
    const t = settings.automatic.saint;
    cards.push({
      id: "auto-saint",
      icon: t.icon || t.style.icon || "✨",
      title: fillTokens(t.title, profile),
      body: fillTokens(t.body, profile),
      style: { ...t.style, icon: t.icon || t.style.icon },
    });
  }

  settings.manual.filter((m) => manualMatches(m, profile)).forEach((m) => {
    const subjectProfile = m.subjectName ? {
      full_name: m.subjectName,
      name: m.subjectName,
      email: m.subjectEmail,
      center: m.subjectCenter,
      department: m.subjectDepartment,
    } : undefined;
    cards.push({
      id: m.id,
      icon: m.style.icon || "🎉",
      title: fillTokens(m.title, profile, subjectProfile),
      body: fillTokens(m.body, profile, subjectProfile),
      style: m.style,
    });
  });

  return cards;
}


export const DEFAULT_COMPANY_TICKER: CompanyTickerSettings = {
  enabled: true,
  messages: [],
};

function mergeTicker(value: any): CompanyTickerSettings {
  return {
    enabled: typeof value?.enabled === "boolean" ? value.enabled : DEFAULT_COMPANY_TICKER.enabled,
    messages: Array.isArray(value?.messages)
      ? value.messages.map((m: any) => ({ ...newCompanyTickerMessage(), ...m }))
      : DEFAULT_COMPANY_TICKER.messages,
  };
}

let cachedCompanyTickerSettings: CompanyTickerSettings = DEFAULT_COMPANY_TICKER;

export async function loadCompanyTickerSettingsFromDb(): Promise<CompanyTickerSettings> {
  const { data, error } = await (supabase as any).rpc("gmt_get_checkin_config", {
    p_key: "company_ticker",
  });

  if (error) {
    console.warn("[GrupMar Time] No se pudo cargar company_ticker desde BD", error);
    return cachedCompanyTickerSettings;
  }

  cachedCompanyTickerSettings = mergeTicker(data || {});
  return cachedCompanyTickerSettings;
}

export function readCompanyTickerSettings(): CompanyTickerSettings {
  return cachedCompanyTickerSettings;
}

export function saveCompanyTickerSettings(settings: CompanyTickerSettings) {
  cachedCompanyTickerSettings = mergeTicker(settings);

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("grupmar-company-ticker-settings-changed", {
        detail: cachedCompanyTickerSettings,
      })
    );
  }

  void (supabase as any)
    .rpc("gmt_save_checkin_config", {
      p_key: "company_ticker",
      p_settings: cachedCompanyTickerSettings,
    })
    .then(({ error }: any) => {
      if (error) {
        console.error("[GrupMar Time] Error guardando company_ticker en BD", error);
      }
    });
}

export function newCompanyTickerMessage(): CompanyTickerMessage {
  return {
    id: `ticker-${Date.now()}`,
    enabled: true,
    published: false,
    publishedAt: "",
    publishMode: "default24h",
    icon: "📢",
    endIcon: "",
    badge: "Aviso",
    title: "Comunicado RRHH",
    body: "Escribe aquí el comunicado oficial que aparecerá en la marquesina superior.",
    targetMode: "all",
    targetValue: "",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    background: "#F8FAFC",
    border: "#BAE6FD",
    text: "#0F172A",
    accent: "#0EA5E9",
    fontFamily: "Arial",
    speed: "normal",
  };
}

function isTickerPublishedNow(message: CompanyTickerMessage) {
  if (!message.published) return false;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (message.publishMode === "custom") {
    if (message.startDate && today < message.startDate) return false;
    if (message.endDate && today > message.endDate) return false;
    return true;
  }
  const publishedAt = message.publishedAt ? new Date(message.publishedAt) : null;
  if (!publishedAt || Number.isNaN(publishedAt.getTime())) return false;
  return now.getTime() - publishedAt.getTime() <= 24 * 60 * 60 * 1000;
}

function tickerTargetMatches(message: CompanyTickerMessage, profile: any) {
  if (!message.enabled) return false;
  if (!isTickerPublishedNow(message)) return false;
  const today = new Date().toISOString().slice(0, 10);
  if (message.publishMode === "custom") {
    if (message.startDate && today < message.startDate) return false;
    if (message.endDate && today > message.endDate) return false;
  }
  const target = String(message.targetValue || "").trim().toLowerCase();
  if (message.targetMode === "all") return true;
  if (!target) return false;
  if (message.targetMode === "employee") {
    return [profile?.id, profile?.email, profile?.full_name].some((x) => String(x || "").toLowerCase() === target);
  }
  if (message.targetMode === "center") return String(profile?.center || "").toLowerCase() === target;
  if (message.targetMode === "department") return String(profile?.department || "").toLowerCase() === target;
  return false;
}

export function buildCompanyTickerItems(profile: any, settings = readCompanyTickerSettings()): CompanyTickerMessage[] {
  if (!settings.enabled) return [];
  return settings.messages.filter((m) => tickerTargetMatches(m, profile));
}


import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type AnyRow = Record<string, any>;
type TickerItem = {
  id: string;
  text: string;
  icon?: string;
  endIcon?: string;
  label?: string;
  background?: string;
  border?: string;
  color?: string;
  accent?: string;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
  textDecoration?: string;
  source?: string;
};

function toDate(value: any) {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function toEndDate(value: any) {
  if (!value) return null;

  const raw = String(value).trim();

  // Si viene solo YYYY-MM-DD, hacerlo inclusivo hasta 23:59:59.
  // Sin esto, "2026-06-23" vence a las 00:00 del mismo día.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(raw + "T23:59:59.999");
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isNowInsideWindow(item: AnyRow) {
  const now = new Date();

  const start =
    toDate(item.start_at) ||
    toDate(item.starts_at) ||
    toDate(item.startDate) ||
    toDate(item.start_date) ||
    toDate(item.available_from) ||
    toDate(item.visible_from);

  const end =
    toEndDate(item.end_at) ||
    toEndDate(item.ends_at) ||
    toEndDate(item.endDate) ||
    toEndDate(item.end_date) ||
    toEndDate(item.available_until) ||
    toEndDate(item.visible_until);

  if (start && now < start) return false;
  if (end && now > end) return false;
  return true;
}

function looksLikeColor(value: any) {
  const text = String(value || "").trim();
  return /^#[0-9a-f]{3,8}$/i.test(text) || /^rgb/i.test(text) || /^hsl/i.test(text);
}

function pickText(item: AnyRow) {
  // IMPORTANTE:
  // En tu BD el campo "text" venía con "#0F172A" porque se usó como color.
  // Por eso el texto real debe salir antes de body/message/content/title.
  const candidates = [
    item.body,
    item.message,
    item.content,
    item.description,
    item.title,
    item.label,
    item.text,
  ];

  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (!value) continue;
    if (looksLikeColor(value)) continue;
    return value;
  }

  return "";
}

function pickIcon(item: AnyRow) {
  if (Array.isArray(item.icons) && item.icons.length > 0) return item.icons.join(" ");
  return String(item.icon || item.emoji || "").trim();
}

function toItems(value: any): TickerItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(Boolean)
    .filter((item: AnyRow) => item.enabled !== false)
    .filter((item: AnyRow) => item.active !== false)
    .filter((item: AnyRow) => item.is_active !== false)
    .filter((item: AnyRow) => item.published === true)
    .filter((item: AnyRow) => !["draft", "borrador", "inactive", "inactivo", "retired", "retirado"].includes(String(item.status || "published").toLowerCase()))
    .filter((item: AnyRow) => isNowInsideWindow(item))
    .map((item: AnyRow, index: number) => ({
      id: String(item.id || `ticker-${index}`),
      text: pickText(item),
      icon: pickIcon(item),
      endIcon: String(item.endIcon || item.end_icon || "").trim(),
      label: String(item.badge || item.label || item.tag || item.category || "Avisos").trim(),
      background: String(item.background || item.bg || "#F8FAFC").trim(),
      border: String(item.border || "#BAE6FD").trim(),
      color: String(item.textColor || item.foreground || item.color || item.text || "#0F172A").trim(),
      accent: String(item.accent || item.badgeColor || "#0EA5E9").trim(),
      fontFamily: String(item.fontFamily || item.font_family || "Arial").trim(),
      fontWeight: String(item.fontWeight || item.font_weight || "700").trim(),
      fontStyle: String(item.fontStyle || item.font_style || "normal").trim(),
      textDecoration: String(item.textDecoration || item.text_decoration || "none").trim(),
      speed: String(item.speed || "normal").trim(),
      source: String(item.source || "bd"),
    }))
    .filter((item: TickerItem) => item.text.length > 0);
}

function normalizeConfig(settings: AnyRow): TickerItem[] {
  const keys = [
    "items",
    "tickerItems",
    "ticker_items",
    "messages",
    "notices",
    "announcements",
    "marquee",
    "marquesina",
    "companyTicker",
    "company_ticker",
  ];

  for (const key of keys) {
    if (Array.isArray(settings?.[key])) {
      const items = toItems(settings[key]);
      if (items.length > 0) return items;
    }
  }

  const single = pickText(settings);
  if (single) {
    return [{ id: "single-config", text: single, icon: pickIcon(settings) || "📣" }];
  }

  return [];
}

function badgeInlineStyle(settings: AnyRow) {
  const item = Array.isArray(settings?.messages) ? settings.messages[0] : null;
  const accent = item?.accent || item?.badgeColor || settings?.accent || "#0EA5E9";

  return {
    background: looksLikeColor(accent) ? accent : "#0EA5E9",
    color: "#ffffff",
  } as React.CSSProperties;
}

function tickerInlineStyle(item?: TickerItem) {
  const bg = item?.background || "#F8FAFC";
  const border = item?.border || "#BAE6FD";
  const color = item?.color || "#0F172A";

  return {
    background: looksLikeColor(bg) || /^linear-gradient/i.test(bg) ? bg : "#F8FAFC",
    color: looksLikeColor(color) ? color : "#0F172A",
    borderBottom: `1px solid ${looksLikeColor(border) ? border : "#BAE6FD"}`,
    fontFamily: item?.fontFamily || "Arial",
    fontWeight: item?.fontWeight || "700",
    fontStyle: item?.fontStyle || "normal",
    textDecoration: item?.textDecoration || "none",
  } as React.CSSProperties;
}

function badgeInlineStyleFromItem(item?: TickerItem) {
  const accent = item?.accent || "#0EA5E9";

  return {
    background: looksLikeColor(accent) ? accent : "#0EA5E9",
    color: "#ffffff",
  } as React.CSSProperties;
}

function tickerShellStyle(item?: TickerItem) {
  const bg = item?.background || "#F8FAFC";
  const border = item?.border || "#BAE6FD";

  return {
    background: looksLikeColor(bg) || /^linear-gradient/i.test(bg) ? bg : "#F8FAFC",
    borderBottom: `1px solid ${looksLikeColor(border) ? border : "#BAE6FD"}`,
  } as React.CSSProperties;
}

function tickerTextStyle(item?: TickerItem) {
  const color = item?.color || "#0F172A";

  return {
    color: looksLikeColor(color) ? color : "#0F172A",
    fontFamily: item?.fontFamily || "Arial",
    fontWeight: item?.fontWeight || "700",
    fontStyle: item?.fontStyle || "normal",
    textDecoration: item?.textDecoration || "none",
  } as React.CSSProperties;
}

function tickerBadgeStyle(item?: TickerItem) {
  const accent = item?.accent || "#0EA5E9";

  return {
    background: looksLikeColor(accent) ? accent : "#0EA5E9",
    color: "#ffffff",
    fontFamily: "Arial",
    fontWeight: "800",
    fontStyle: "normal",
    textDecoration: "none",
  } as React.CSSProperties;
}

function speedFromTickerItem(item?: TickerItem, fallback = 28) {
  const speed = String(item?.speed || "").toLowerCase();

  if (speed === "static") return 0;
  if (speed === "slow") return 52;
  if (speed === "fast") return 14;
  if (speed === "normal") return 28;

  return fallback;
}

function paletteStyle(settings: AnyRow) {
  const item = Array.isArray(settings?.messages) ? settings.messages[0] : null;

  const bg =
    item?.background ||
    settings?.background ||
    settings?.bg ||
    "";

  const color =
    item?.textColor ||
    item?.foreground ||
    item?.color ||
    (looksLikeColor(item?.text) ? item?.text : "") ||
    settings?.textColor ||
    settings?.foreground ||
    settings?.color ||
    "";

  const border =
    item?.border ||
    settings?.border ||
    "";

  if (bg || color || border) {
    return {
      background: looksLikeColor(bg) || /^linear-gradient/i.test(String(bg || "")) ? bg : "#F8FAFC",
      color: looksLikeColor(color) ? color : "#0F172A",
      borderBottom: border ? `1px solid ${border}` : undefined,
    } as React.CSSProperties;
  }

  return {
    background: "linear-gradient(90deg,#f8fafc,#eef6ff,#ffffff)",
    color: "#0f172a",
  } as React.CSSProperties;
}

async function loadItemsFromDb(): Promise<{ settings: AnyRow; items: TickerItem[] }> {
  // 1) RPC canónica si existe.
  try {
    const { data, error } = await (supabase as any).rpc("gmt_company_ticker_items");
    if (!error) {
      const items = toItems(data);
      if (items.length > 0) return { settings: {}, items };
    } else {
      console.warn("[GrupMar Time] gmt_company_ticker_items error", error);
    }
  } catch (error) {
    console.warn("[GrupMar Time] gmt_company_ticker_items no disponible", error);
  }

  // 2) Config BD directa.
  try {
    const { data, error } = await (supabase as any)
      .from("gmt_checkin_config")
      .select("key,settings,updated_at")
      .order("updated_at", { ascending: false });

    if (!error && Array.isArray(data)) {
      for (const row of data) {
        const settings = row.settings || {};
        const items = normalizeConfig(settings);
        if (items.length > 0) return { settings, items };
      }
    } else if (error) {
      console.warn("[GrupMar Time] gmt_checkin_config error", error);
    }
  } catch (error) {
    console.warn("[GrupMar Time] gmt_checkin_config no disponible", error);
  }

  // 3) Comunicados publicados.
  try {
    const { data, error } = await (supabase as any)
      .from("checkin_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (!error && Array.isArray(data)) {
      const items = toItems(data);
      if (items.length > 0) return { settings: {}, items };
    } else if (error) {
      console.warn("[GrupMar Time] checkin_messages error", error);
    }
  } catch (error) {
    console.warn("[GrupMar Time] checkin_messages no disponible", error);
  }

  return { settings: {}, items: [] };
}

export function CompanyTickerFromDB() {
  const [settings, setSettings] = useState<AnyRow>({});
  const [items, setItems] = useState<TickerItem[]>([]);
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let alive = true;
    let sessionActive = false;
    let timer: number | null = null;

    function clearTicker() {
      setSettings({});
      setItems([]);
      setReady(true);
      document.body.style.paddingTop = "";
    }

    function stopTimer() {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    }

    async function loadTicker() {
      if (!sessionActive) {
        clearTicker();
        return;
      }

      const result = await loadItemsFromDb();
      if (!alive || !sessionActive) return;

      setSettings(result.settings || {});
      setItems(result.items || []);
      setReady(true);
    }

    function startTimer() {
      if (timer === null) {
        timer = window.setInterval(loadTicker, 60_000);
      }
    }

    async function boot() {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;

      sessionActive = Boolean(data.session);
      setAuthenticated(sessionActive);

      if (!sessionActive) {
        stopTimer();
        clearTicker();
        return;
      }

      await loadTicker();
      startTimer();
    }

    boot();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      sessionActive = Boolean(session);
      setAuthenticated(sessionActive);

      if (!sessionActive) {
        stopTimer();
        clearTicker();
        return;
      }

      setReady(false);
      window.setTimeout(() => {
        void loadTicker();
        startTimer();
      }, 0);
    });

    const onFocus = () => {
      void loadTicker();
    };

    const onRefresh = () => {
      void loadTicker();
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("gmt:ticker-refresh", onRefresh);

    return () => {
      alive = false;
      stopTimer();
      document.body.style.paddingTop = "";
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("gmt:ticker-refresh", onRefresh);
      authListener.subscription.unsubscribe();
    };
  }, []);

  const content = useMemo(
    () => items.map((item) => `${item.icon ? `${item.icon} ` : ""}${item.text}${item.endIcon ? ` ${item.endIcon}` : ""}`).join("   •   "),
    [items],
  );

    useEffect(() => {
    if (!ready || items.length === 0) {
      document.body.style.paddingTop = "";
      return;
    }

    const node = document.getElementById("grupmar-global-db-ticker");
    const height = node?.getBoundingClientRect().height || 34;
    document.body.style.paddingTop = `${height}px`;

    return () => {
      document.body.style.paddingTop = "";
    };
  }, [ready, authenticated, items.length, settings.enabled, settings.active]);

  if (!ready) return null;
  if (!authenticated) return null;
  if (settings.enabled === false) return null;
  if (settings.active === false) return null;
  if (items.length === 0) return null;

  const first = items[0];
  const speed = speedFromTickerItem(first, Number(settings.speedSeconds || settings.speed_seconds || settings.duration || 28));
  const safeSpeed = speed === 0 ? 0 : (Number.isFinite(speed) ? Math.max(10, Math.min(90, speed)) : 28);

  return (
    <div
      id="grupmar-global-db-ticker"
      className="fixed left-0 right-0 top-0 z-[2147483000] w-full overflow-hidden shadow-sm"
      style={tickerShellStyle(first)}
    >
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 text-sm font-extrabold tracking-tight">
        <span
          className="shrink-0 rounded-full px-3 py-1 text-xs uppercase tracking-[0.18em] shadow-sm"
          style={tickerBadgeStyle(first)}
        >
          {first?.label || "Avisos"}
        </span>

        <div className="relative min-w-0 flex-1 overflow-hidden whitespace-nowrap">
          <div
            className="inline-block min-w-full animate-[grupmarTicker_var(--ticker-speed)_linear_infinite]"
            style={{ ["--ticker-speed" as any]: `${safeSpeed}s` }}
          >
            <span className="pr-16" style={tickerTextStyle(first)}>{content}</span>
            <span className="pr-16" style={tickerTextStyle(first)}>{content}</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes grupmarTicker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

export default CompanyTickerFromDB;


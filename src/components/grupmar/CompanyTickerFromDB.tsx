import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type AnyRow = Record<string, any>;
type TickerItem = { id: string; text: string; icon?: string; source?: string };

function toDate(value: any) {
  if (!value) return null;
  const d = new Date(String(value));
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
    toDate(item.end_at) ||
    toDate(item.ends_at) ||
    toDate(item.endDate) ||
    toDate(item.end_date) ||
    toDate(item.available_until) ||
    toDate(item.visible_until);

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
    .filter((item: AnyRow) => item.published !== false)
    .filter((item: AnyRow) => !["draft", "borrador", "inactive", "inactivo", "retired", "retirado"].includes(String(item.status || "published").toLowerCase()))
    .filter((item: AnyRow) => isNowInsideWindow(item))
    .map((item: AnyRow, index: number) => ({
      id: String(item.id || `ticker-${index}`),
      text: pickText(item),
      icon: pickIcon(item),
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
      background: bg || "linear-gradient(90deg,#0f172a,#1e293b,#334155)",
      color: looksLikeColor(color) ? color : "#ffffff",
      borderBottom: border ? `1px solid ${border}` : undefined,
    } as React.CSSProperties;
  }

  return {
    background: "linear-gradient(90deg,#0f172a,#1e293b,#334155)",
    color: "#ffffff",
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

  useEffect(() => {
    let alive = true;

    async function loadTicker() {
      const result = await loadItemsFromDb();
      if (!alive) return;

      setSettings(result.settings || {});
      setItems(result.items || []);
      setReady(true);
    }

    loadTicker();

    const timer = window.setInterval(loadTicker, 60_000);
    window.addEventListener("focus", loadTicker);
    window.addEventListener("gmt:ticker-refresh", loadTicker as EventListener);

    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", loadTicker);
      window.removeEventListener("gmt:ticker-refresh", loadTicker as EventListener);
    };
  }, []);

  const content = useMemo(
    () => items.map((item) => `${item.icon ? `${item.icon} ` : ""}${item.text}`).join("   •   "),
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
  }, [ready, items.length]);

  if (!ready) return null;
  if (settings.enabled === false) return null;
  if (settings.active === false) return null;
  if (items.length === 0) return null;

  const speed = Number(settings.speedSeconds || settings.speed_seconds || settings.duration || 28);
  const safeSpeed = Number.isFinite(speed) ? Math.max(10, Math.min(90, speed)) : 28;

  return (
    <div
      id="grupmar-global-db-ticker"
      className="fixed left-0 right-0 top-0 z-[2147483000] w-full overflow-hidden shadow-sm"
      style={paletteStyle(settings)}
    >
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 text-sm font-extrabold tracking-tight">
        <span className="shrink-0 rounded-full bg-black/10 px-3 py-1 text-xs uppercase tracking-[0.18em]">
          Avisos
        </span>

        <div className="relative min-w-0 flex-1 overflow-hidden whitespace-nowrap">
          <div
            className="inline-block min-w-full animate-[grupmarTicker_var(--ticker-speed)_linear_infinite]"
            style={{ ["--ticker-speed" as any]: `${safeSpeed}s` }}
          >
            <span className="pr-16">{content}</span>
            <span className="pr-16">{content}</span>
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


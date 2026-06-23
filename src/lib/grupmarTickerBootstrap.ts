import { supabase } from "@/integrations/supabase/client";

type AnyRow = Record<string, any>;
type TickerItem = {
  id: string;
  text: string;
  icon?: string;
  source?: string;
};

const TICKER_ID = "grupmar-global-db-ticker";
const STYLE_ID = "grupmar-global-db-ticker-style";

function escapeHtml(value: string) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toItems(value: any): TickerItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item: AnyRow, index: number) => ({
      id: String(item.id || `ticker-${index}`),
      text: String(item.text || item.message || item.body || item.content || item.title || "").trim(),
      icon: String(item.icon || item.emoji || "").trim(),
      source: String(item.source || "bd"),
    }))
    .filter((item) => item.text.length > 0);
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

  const single = String(
    settings?.text || settings?.message || settings?.body || settings?.content || settings?.title || ""
  ).trim();

  if (single) {
    return [{ id: "single-config", text: single, icon: String(settings?.icon || settings?.emoji || "📣") }];
  }

  return [];
}

async function loadItems(): Promise<TickerItem[]> {
  try {
    const { data, error } = await (supabase as any).rpc("gmt_company_ticker_items");
    if (!error) {
      const items = toItems(data);
      if (items.length > 0) return items;
    } else {
      console.warn("[GrupMar Time] RPC gmt_company_ticker_items error", error);
    }
  } catch (error) {
    console.warn("[GrupMar Time] RPC gmt_company_ticker_items no disponible", error);
  }

  try {
    const { data, error } = await (supabase as any)
      .from("gmt_checkin_config")
      .select("key,settings,updated_at")
      .order("updated_at", { ascending: false });

    if (!error && Array.isArray(data)) {
      for (const row of data) {
        const items = normalizeConfig(row.settings || {});
        if (items.length > 0) {
          return items.map((item) => ({ ...item, source: `gmt_checkin_config:${row.key}` }));
        }
      }
    } else if (error) {
      console.warn("[GrupMar Time] gmt_checkin_config error", error);
    }
  } catch (error) {
    console.warn("[GrupMar Time] gmt_checkin_config no disponible", error);
  }

  try {
    const { data, error } = await (supabase as any)
      .from("checkin_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (!error && Array.isArray(data)) {
      return data
        .filter((row: AnyRow) => row.is_active !== false)
        .filter((row: AnyRow) => !["draft", "borrador", "inactive", "inactivo", "retired", "retirado"].includes(String(row.status || "published").toLowerCase()))
        .map((row: AnyRow) => ({
          id: String(row.id || row.title),
          text: String(row.text || row.message || row.body || row.content || row.title || "").trim(),
          icon: String(row.icon || row.emoji || "📣").trim(),
          source: "public.checkin_messages",
        }))
        .filter((item: TickerItem) => item.text.length > 0);
    } else if (error) {
      console.warn("[GrupMar Time] checkin_messages error", error);
    }
  } catch (error) {
    console.warn("[GrupMar Time] checkin_messages no disponible", error);
  }

  return [];
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${TICKER_ID} {
      width: 100%;
      position: sticky;
      top: 0;
      z-index: 2147483000;
      background: linear-gradient(90deg, #0f172a, #1e293b, #334155);
      color: white;
      box-shadow: 0 10px 30px rgba(15, 23, 42, .18);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #${TICKER_ID} .gmt-ticker-inner {
      max-width: 1180px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 9px 18px;
      overflow: hidden;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: -0.01em;
    }
    #${TICKER_ID} .gmt-ticker-badge {
      flex: 0 0 auto;
      border-radius: 999px;
      padding: 5px 11px;
      background: rgba(255,255,255,.16);
      border: 1px solid rgba(255,255,255,.22);
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: .18em;
    }
    #${TICKER_ID} .gmt-ticker-mask {
      min-width: 0;
      flex: 1 1 auto;
      overflow: hidden;
      white-space: nowrap;
    }
    #${TICKER_ID} .gmt-ticker-track {
      display: inline-block;
      min-width: 100%;
      animation: gmtTickerMove 28s linear infinite;
    }
    #${TICKER_ID}:hover .gmt-ticker-track {
      animation-play-state: paused;
    }
    #${TICKER_ID} .gmt-ticker-text {
      padding-right: 80px;
    }
    @keyframes gmtTickerMove {
      0% { transform: translateX(0); }
      100% { transform: translateX(-50%); }
    }
  `;

  document.head.appendChild(style);
}

function renderTicker(items: TickerItem[]) {
  if (typeof document === "undefined") return;

  const existing = document.getElementById(TICKER_ID);

  if (items.length === 0) {
    existing?.remove();
    return;
  }

  ensureStyle();

  const content = items
    .map((item) => `${item.icon ? `${escapeHtml(item.icon)} ` : ""}${escapeHtml(item.text)}`)
    .join("   •   ");

  const html = `
    <div class="gmt-ticker-inner">
      <div class="gmt-ticker-badge">Avisos</div>
      <div class="gmt-ticker-mask">
        <div class="gmt-ticker-track">
          <span class="gmt-ticker-text">${content}</span>
          <span class="gmt-ticker-text">${content}</span>
        </div>
      </div>
    </div>
  `;

  let node = existing;

  if (!node) {
    node = document.createElement("div");
    node.id = TICKER_ID;

    const app =
      document.getElementById("root") ||
      document.getElementById("__root") ||
      document.querySelector("[data-grupmar-root]") ||
      document.body.firstElementChild;

    if (app && app.parentElement) {
      app.parentElement.insertBefore(node, app);
    } else {
      document.body.prepend(node);
    }
  }

  node.innerHTML = html;
}

async function refreshTicker() {
  const items = await loadItems();
  renderTicker(items);
}

function start() {
  if (typeof window === "undefined") return;

  window.setTimeout(refreshTicker, 600);
  window.setInterval(refreshTicker, 60_000);
  window.addEventListener("focus", refreshTicker);
  window.addEventListener("gmt:ticker-refresh", refreshTicker as EventListener);
}

start();

export {};

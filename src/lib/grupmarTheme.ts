export type ThemeId = string;

export type GrupmarTheme = {
  id: string;
  name: string;
  mode: "Claro" | "Oscuro" | "Personalizado";
  description: string;
  preview: string[];
  vars: Record<string, string>;
  custom?: boolean;
  basedOn?: string;
};

export const GRUPMAR_THEME_STORAGE = "grupmar_time_global_theme_v1";
export const GRUPMAR_CUSTOM_THEMES_STORAGE = "grupmar_time_custom_themes_v2";

const COMMON_STATUS_VARS = {
  "--gmt-danger": "#e11d48",
  "--gmt-success": "#16a34a",
  "--gmt-warning": "#d97706",
};

export const BUILTIN_GRUPMAR_THEMES: GrupmarTheme[] = [
  {
    id: "win11-light",
    name: "Windows 11 claro",
    mode: "Claro",
    description: "Blanco limpio, celeste suave y contraste cómodo para oficina.",
    preview: ["#f7fbff", "#ffffff", "#d9ecff", "#2563eb"],
    vars: {
      "--gmt-bg": "#f7fbff",
      "--gmt-card": "#ffffff",
      "--gmt-ink": "#14213d",
      "--gmt-muted": "#5f6f89",
      "--gmt-line": "#d8e6f3",
      "--gmt-blue": "#2563eb",
      "--gmt-blue-soft": "#e8f2ff",
      "--gmt-sky": "#dff0ff",
      "--gmt-sidebar": "#ffffff",
      "--gmt-logo-bg": "transparent",
      "--gmt-sidebar-active": "#e9f4ff",
      "--gmt-sidebar-active-ink": "#14213d",
      "--gmt-topbar": "#ffffff",
      "--gmt-action-bg": "#2563eb",
      "--gmt-action-ink": "#ffffff",
      "--gmt-shadow": "0 18px 45px rgba(31,60,112,.10)",
      "--gmt-shadow-sm": "0 8px 24px rgba(31,60,112,.08)",
      ...COMMON_STATUS_VARS,
    },
  },
  {
    id: "win11-dark",
    name: "Windows 11 oscuro",
    mode: "Oscuro",
    description: "Oscuro elegante con azul Windows, ideal para trabajar de noche.",
    preview: ["#0f172a", "#111827", "#1e293b", "#60a5fa"],
    vars: {
      "--gmt-bg": "#0f172a",
      "--gmt-card": "#111827",
      "--gmt-ink": "#f8fafc",
      "--gmt-muted": "#cbd5e1",
      "--gmt-line": "#334155",
      "--gmt-blue": "#60a5fa",
      "--gmt-blue-soft": "#172554",
      "--gmt-sky": "#1e3a8a",
      "--gmt-sidebar": "#0b1220",
      "--gmt-logo-bg": "transparent",
      "--gmt-sidebar-active": "#1e3a8a",
      "--gmt-sidebar-active-ink": "#ffffff",
      "--gmt-topbar": "#0f172a",
      "--gmt-action-bg": "#60a5fa",
      "--gmt-action-ink": "#0f172a",
      "--gmt-shadow": "0 18px 45px rgba(0,0,0,.30)",
      "--gmt-shadow-sm": "0 8px 24px rgba(0,0,0,.25)",
      ...COMMON_STATUS_VARS,
    },
  },
  {
    id: "grupmar-sky",
    name: "GrupMar celeste",
    mode: "Personalizado",
    description: "Celeste corporativo, suave, fresco y muy legible.",
    preview: ["#eef8ff", "#ffffff", "#cfeeff", "#0284c7"],
    vars: {
      "--gmt-bg": "#eef8ff",
      "--gmt-card": "#ffffff",
      "--gmt-ink": "#0f2942",
      "--gmt-muted": "#5b7187",
      "--gmt-line": "#cce3f3",
      "--gmt-blue": "#0284c7",
      "--gmt-blue-soft": "#e0f2fe",
      "--gmt-sky": "#bae6fd",
      "--gmt-sidebar": "#f8fcff",
      "--gmt-logo-bg": "transparent",
      "--gmt-sidebar-active": "#e0f2fe",
      "--gmt-sidebar-active-ink": "#0f2942",
      "--gmt-topbar": "#f8fcff",
      "--gmt-action-bg": "#0284c7",
      "--gmt-action-ink": "#ffffff",
      "--gmt-shadow": "0 18px 45px rgba(2,132,199,.13)",
      "--gmt-shadow-sm": "0 8px 24px rgba(2,132,199,.09)",
      ...COMMON_STATUS_VARS,
    },
  },
  {
    id: "deep-sea",
    name: "Mar profundo",
    mode: "Oscuro",
    description: "Azul marino profundo con acentos turquesa, profesional y sobrio.",
    preview: ["#071923", "#0b2430", "#123d4d", "#2dd4bf"],
    vars: {
      "--gmt-bg": "#071923",
      "--gmt-card": "#0b2430",
      "--gmt-ink": "#eaffff",
      "--gmt-muted": "#a7c7cf",
      "--gmt-line": "#205063",
      "--gmt-blue": "#2dd4bf",
      "--gmt-blue-soft": "#123d4d",
      "--gmt-sky": "#155e75",
      "--gmt-sidebar": "#06141d",
      "--gmt-logo-bg": "transparent",
      "--gmt-sidebar-active": "#123d4d",
      "--gmt-sidebar-active-ink": "#eaffff",
      "--gmt-topbar": "#071923",
      "--gmt-action-bg": "#2dd4bf",
      "--gmt-action-ink": "#06141d",
      "--gmt-shadow": "0 18px 45px rgba(0,0,0,.32)",
      "--gmt-shadow-sm": "0 8px 24px rgba(0,0,0,.26)",
      ...COMMON_STATUS_VARS,
    },
  },
  {
    id: "warm-sand",
    name: "Arena cálida",
    mode: "Claro",
    description: "Tonos crema, tierra y azul suave; cómodo para pantallas grandes.",
    preview: ["#fbf6ec", "#fffdf8", "#efe3cf", "#0f766e"],
    vars: {
      "--gmt-bg": "#fbf6ec",
      "--gmt-card": "#fffdf8",
      "--gmt-ink": "#2b2118",
      "--gmt-muted": "#756a5c",
      "--gmt-line": "#e8dcc8",
      "--gmt-blue": "#0f766e",
      "--gmt-blue-soft": "#e6f4f1",
      "--gmt-sky": "#d9eee9",
      "--gmt-sidebar": "#fffaf1",
      "--gmt-logo-bg": "transparent",
      "--gmt-sidebar-active": "#efe3cf",
      "--gmt-sidebar-active-ink": "#2b2118",
      "--gmt-topbar": "#fffaf1",
      "--gmt-action-bg": "#0f766e",
      "--gmt-action-ink": "#ffffff",
      "--gmt-shadow": "0 18px 45px rgba(89,70,45,.12)",
      "--gmt-shadow-sm": "0 8px 24px rgba(89,70,45,.08)",
      ...COMMON_STATUS_VARS,
    },
  },
  {
    id: "violet-pro",
    name: "Violeta premium",
    mode: "Personalizado",
    description: "Blanco con acentos violeta y azul, moderno tipo suite corporativa.",
    preview: ["#faf7ff", "#ffffff", "#ede9fe", "#7c3aed"],
    vars: {
      "--gmt-bg": "#faf7ff",
      "--gmt-card": "#ffffff",
      "--gmt-ink": "#231942",
      "--gmt-muted": "#675c82",
      "--gmt-line": "#e3d8ff",
      "--gmt-blue": "#7c3aed",
      "--gmt-blue-soft": "#ede9fe",
      "--gmt-sky": "#ddd6fe",
      "--gmt-sidebar": "#ffffff",
      "--gmt-logo-bg": "transparent",
      "--gmt-sidebar-active": "#f1ebff",
      "--gmt-sidebar-active-ink": "#231942",
      "--gmt-topbar": "#ffffff",
      "--gmt-action-bg": "#7c3aed",
      "--gmt-action-ink": "#ffffff",
      "--gmt-shadow": "0 18px 45px rgba(124,58,237,.14)",
      "--gmt-shadow-sm": "0 8px 24px rgba(124,58,237,.10)",
      ...COMMON_STATUS_VARS,
    },
  },
  {
    id: "bizneo-gray",
    name: "Bizneo gris claro",
    mode: "Claro",
    description: "Gris corporativo claro con letras negras. Botones en gris claro; colores vivos sólo para alertas.",
    preview: ["#f4f5f7", "#ffffff", "#d7dce2", "#f3f4f6"],
    vars: {
      "--gmt-bg": "#f4f5f7",
      "--gmt-card": "#ffffff",
      "--gmt-ink": "#111827",
      "--gmt-muted": "#667085",
      "--gmt-line": "#d7dce2",
      "--gmt-blue": "#dfe3e8",
      "--gmt-blue-soft": "#f3f4f6",
      "--gmt-sky": "#e5e7eb",
      "--gmt-sidebar": "#ffffff",
      "--gmt-logo-bg": "transparent",
      "--gmt-sidebar-active": "#eef0f3",
      "--gmt-sidebar-active-ink": "#111827",
      "--gmt-topbar": "#ffffff",
      "--gmt-action-bg": "#f3f4f6",
      "--gmt-action-ink": "#111827",
      "--gmt-shadow": "0 18px 45px rgba(17,24,39,.08)",
      "--gmt-shadow-sm": "0 8px 24px rgba(17,24,39,.06)",
      ...COMMON_STATUS_VARS,
    },
  },
];

export const GRUPMAR_THEMES = BUILTIN_GRUPMAR_THEMES;

function safeJson<T>(value: string | null, fallback: T): T {
  try {
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

export function readCustomThemes(): GrupmarTheme[] {
  if (typeof window === "undefined") return [];
  return safeJson<GrupmarTheme[]>(localStorage.getItem(GRUPMAR_CUSTOM_THEMES_STORAGE), []);
}

export function writeCustomThemes(themes: GrupmarTheme[]) {
  if (typeof window !== "undefined") {
    localStorage.setItem(GRUPMAR_CUSTOM_THEMES_STORAGE, JSON.stringify(themes));
  }
  return themes;
}

export function getAllThemes() {
  return [...BUILTIN_GRUPMAR_THEMES, ...readCustomThemes()];
}

export function upsertCustomTheme(theme: GrupmarTheme) {
  const all = readCustomThemes();
  const cleanTheme = {
    ...theme,
    custom: true,
    mode: "Personalizado" as const,
    preview: [
      theme.vars["--gmt-bg"],
      theme.vars["--gmt-card"],
      theme.vars["--gmt-line"],
      theme.vars["--gmt-action-bg"],
    ],
  };
  const next = all.some((item) => item.id === cleanTheme.id)
    ? all.map((item) => item.id === cleanTheme.id ? cleanTheme : item)
    : [...all, cleanTheme];
  writeCustomThemes(next);
  return cleanTheme;
}

export function deleteCustomTheme(id: string) {
  const next = readCustomThemes().filter((item) => item.id !== id);
  writeCustomThemes(next);
  if (typeof window !== "undefined" && localStorage.getItem(GRUPMAR_THEME_STORAGE) === id) {
    localStorage.setItem(GRUPMAR_THEME_STORAGE, "bizneo-gray");
  }
  return next;
}

export function getTheme(id?: string | null) {
  return getAllThemes().find((theme) => theme.id === id) ?? BUILTIN_GRUPMAR_THEMES[0];
}

export function getSavedTheme() {
  if (typeof window === "undefined") return getTheme("bizneo-gray");
  return getTheme(localStorage.getItem(GRUPMAR_THEME_STORAGE) || "bizneo-gray");
}

function ensureRuntimeStyle() {
  if (typeof document === "undefined") return;
  let style = document.getElementById("grupmar-theme-runtime") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "grupmar-theme-runtime";
    document.head.appendChild(style);
  }
  style.textContent = `
    html, body { background: var(--gmt-bg) !important; color: var(--gmt-ink) !important; }
    body { transition: background .25s ease, color .25s ease; }
    .gmt-shell, .min-h-screen { background: var(--gmt-bg) !important; color: var(--gmt-ink) !important; }
    .gmt-sidebar, aside.gmt-sidebar { background: var(--gmt-sidebar) !important; border-color: var(--gmt-line) !important; color: var(--gmt-ink) !important; }
    .gmt-topbar, header, nav { background: var(--gmt-topbar) !important; border-color: var(--gmt-line) !important; }
    .gmt-panel, .gmt-card, .gmt-report-card, .gmt-module-frame, .rounded-2xl, .rounded-3xl { border-color: var(--gmt-line) !important; }
    .gmt-panel, .gmt-card, .gmt-report-card, .gmt-module-frame, [class*="bg-white"] { background-color: var(--gmt-card) !important; color: var(--gmt-ink) !important; box-shadow: var(--gmt-shadow-sm); }
    .gmt-title, h1, h2, h3, h4, .font-bold, .font-semibold, .font-black { color: var(--gmt-ink) !important; }
    .gmt-subtitle, .text-muted-foreground, .text-slate-500, .text-slate-600, .text-gray-500, .text-gray-600 { color: var(--gmt-muted) !important; }
    .gmt-navlink, .gmt-btn, button, select, input, textarea { border-color: var(--gmt-line) !important; }

    .gmt-navlink.active,
    .gmt-navlink[aria-current="page"],
    .gmt-navlink:hover,
    .gmt-sidebar .active,
    .gmt-navlink-active {
      background: var(--gmt-sidebar-active) !important;
      color: var(--gmt-sidebar-active-ink) !important;
    }

    .gmt-pill, .badge, .gmt-version-badge, [data-slot="badge"] {
      background: var(--gmt-blue-soft) !important;
      color: var(--gmt-ink) !important;
      border-color: var(--gmt-line) !important;
    }

    .bg-blue-600,
    .bg-sky-600,
    .bg-indigo-600,
    .bg-slate-900,
    .bg-primary,
    .gmt-primary {
      background-color: var(--gmt-action-bg) !important;
      color: var(--gmt-action-ink) !important;
      border-color: var(--gmt-line) !important;
    }

    .hover\\:bg-blue-700:hover,
    .hover\\:bg-sky-700:hover,
    .hover\\:bg-indigo-700:hover,
    .hover\\:bg-slate-800:hover {
      background-color: color-mix(in srgb, var(--gmt-action-bg) 84%, #000 8%) !important;
      color: var(--gmt-action-ink) !important;
    }

    .text-blue-600, .text-sky-600, .text-indigo-600, .text-primary { color: var(--gmt-ink) !important; }
    .border-blue-300, .border-blue-400, .border-sky-100, .border-sky-200, .border-primary { border-color: var(--gmt-line) !important; }
    .bg-blue-50, .bg-sky-50, .bg-indigo-50 { background-color: var(--gmt-blue-soft) !important; }
    .text-blue-800, .text-sky-800, .text-indigo-800 { color: var(--gmt-ink) !important; }
    .shadow, .shadow-sm, .shadow-lg, .shadow-xl { box-shadow: var(--gmt-shadow-sm) !important; }

    .text-rose-600, .text-red-600, .text-amber-600, .text-yellow-700, .text-emerald-600, .text-green-600 { color: revert !important; }
    .bg-rose-50, .bg-red-50, .bg-amber-50, .bg-yellow-50, .bg-emerald-50, .bg-green-50 { background-color: revert !important; }
    .border-rose-200, .border-red-200, .border-amber-200, .border-yellow-200, .border-emerald-200, .border-green-200 { border-color: revert !important; }
  `;
}

export function applyTheme(id: ThemeId | string, options?: { persist?: boolean; vars?: Record<string, string> }) {
  const theme = getTheme(id);
  const vars = { ...theme.vars, ...(options?.vars ?? {}) };
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    Object.entries(vars).forEach(([key, value]) => root.style.setProperty(key, value));
    root.dataset.grupmarTheme = theme.id;
    root.classList.remove(...getAllThemes().map((item) => `gmt-theme-${item.id}`));
    root.classList.add(`gmt-theme-${theme.id}`);
    ensureRuntimeStyle();
  }
  if (options?.persist && typeof window !== "undefined") {
    localStorage.setItem(GRUPMAR_THEME_STORAGE, theme.id);
  }
  return theme;
}

export function applySavedTheme() {
  const theme = getSavedTheme();
  applyTheme(theme.id);
  return theme;
}

export function saveTheme(id: ThemeId | string) {
  return applyTheme(id, { persist: true });
}





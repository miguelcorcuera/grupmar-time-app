import { supabase } from "@/integrations/supabase/client";
export type InternalNewsAudience = "all" | "employee" | "center" | "department";
export type InternalNewsLayout = "classic" | "newspaper" | "magazine" | "interview" | "gallery";
export type InternalNewsHeaderStyle = "clean" | "banner" | "boxed" | "left-border";
export type InternalNewsBlockType = "subtitle" | "paragraph" | "quote" | "highlight";

export type InternalNewsBlock = {
  id: string;
  type: InternalNewsBlockType;
  text: string;
};

export type InternalNewsItem = {
  id: string;
  title: string;
  subtitle?: string;
  summary: string;
  body: string;
  category: string;
  icons: string[];
  icon?: string;
  imageUrl?: string;
  imageUrls?: string[];
  audience: InternalNewsAudience;
  targetValue?: string;
  active: boolean;
  published: boolean;
  startAt: string;
  endAt: string;
  background: string;
  border: string;
  textColor: string;
  accent: string;
  fontFamily: string;
  featured?: boolean;
  createdAt: string;
  updatedAt: string;

  // Diseño editorial
  layout?: InternalNewsLayout;
  headerStyle?: InternalNewsHeaderStyle;
  borderRadius?: string;
  headlineColor?: string;
  showHero?: boolean;
  author?: string;
  tags?: string;
  contentBlocks?: InternalNewsBlock[];
};

export const NEWS_EMOJIS = [
  "📰", "📢", "📸", "🎉", "🏆", "🚢", "🏖️", "🍽️", "🛟", "🤝", "📈", "🧑‍💼", "⭐", "🎄", "📅", "🕒", "✅", "⚠️",
  "🎤", "👥", "🧩", "📝", "📌", "💡", "🚀", "💬", "📷", "🖼️", "🏗️", "💼", "🌊", "🔔"
];

export const NEWS_CATEGORIES = [
  "Noticias de la empresa",
  "Eventos internos",
  "Entrevistas al personal",
  "Logros",
  "Contratos nuevos",
  "Operaciones",
  "Marketing",
  "RRHH",
  "Seguridad",
  "Formación",
  "Fotos de equipo",
];

export const NEWS_LAYOUTS: { id: InternalNewsLayout; label: string; description: string }[] = [
  { id: "classic", label: "Clásico", description: "Artículo limpio con imagen principal y texto." },
  { id: "newspaper", label: "Periódico", description: "Cabecera editorial, entradilla y columnas visuales." },
  { id: "magazine", label: "Revista", description: "Imagen protagonista y bloques destacados." },
  { id: "interview", label: "Entrevista", description: "Ideal para entrevistas al personal con citas." },
  { id: "gallery", label: "Galería", description: "Varias fotos con texto de apoyo." },
];

export const NEWS_HEADER_STYLES: { id: InternalNewsHeaderStyle; label: string }[] = [
  { id: "clean", label: "Limpia" },
  { id: "banner", label: "Cabecera con banda" },
  { id: "boxed", label: "Caja editorial" },
  { id: "left-border", label: "Borde lateral" },
];

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function createNewsBlock(type: InternalNewsBlockType = "paragraph", text = ""): InternalNewsBlock {
  return { id: `block-${uid()}`, type, text };
}

export const DEFAULT_NEWS_ITEM: InternalNewsItem = {
  id: "news-template",
  title: "",
  subtitle: "",
  summary: "",
  body: "",
  category: "Noticias de la empresa",
  icons: ["📰"],
  icon: "📰",
  imageUrl: "",
  imageUrls: [],
  audience: "all",
  active: true,
  published: false,
  startAt: today(),
  endAt: plusDays(30),
  background: "#ffffff",
  border: "#bfdbfe",
  textColor: "#0f172a",
  accent: "#2563eb",
  fontFamily: "Arial",
  featured: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  layout: "newspaper",
  headerStyle: "banner",
  borderRadius: "28px",
  headlineColor: "#0f172a",
  showHero: true,
  author: "Marketing / RRHH",
  tags: "",
  contentBlocks: [],
};

export function normalizeNewsItem(raw: Partial<InternalNewsItem>): InternalNewsItem {
  const now = new Date().toISOString();
  const imageUrls = Array.isArray(raw.imageUrls)
    ? raw.imageUrls.filter(Boolean)
    : raw.imageUrl
      ? [raw.imageUrl]
      : [];
  return {
    ...DEFAULT_NEWS_ITEM,
    ...raw,
    id: raw.id || `news-${uid()}`,
    icons: Array.isArray(raw.icons) && raw.icons.length ? raw.icons : [raw.icon || "📰"],
    icon: raw.icon || raw.icons?.[0] || "📰",
    imageUrl: raw.imageUrl || imageUrls[0] || "",
    imageUrls,
    active: raw.active ?? true,
    published: raw.published ?? false,
    startAt: raw.startAt || today(),
    endAt: raw.endAt || plusDays(30),
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now,
    layout: raw.layout || "classic",
    headerStyle: raw.headerStyle || "clean",
    borderRadius: raw.borderRadius || "28px",
    headlineColor: raw.headlineColor || raw.textColor || "#0f172a",
    showHero: raw.showHero ?? true,
    author: raw.author || "Marketing / RRHH",
    tags: raw.tags || "",
    contentBlocks: Array.isArray(raw.contentBlocks) ? raw.contentBlocks : [],
  };
}


function normalizeNewsArray(data: any): InternalNewsItem[] {
  return Array.isArray(data) ? data.map((item) => normalizeNewsItem(item)) : [];
}

export async function loadAdminInternalNews(): Promise<InternalNewsItem[]> {
  const { data, error } = await (supabase as any).rpc("gmt_admin_internal_news_items");
  if (error) throw error;
  return normalizeNewsArray(data);
}

export async function loadPublicInternalNews(): Promise<InternalNewsItem[]> {
  const { data, error } = await (supabase as any).rpc("gmt_public_internal_news_items");
  if (error) throw error;
  return normalizeNewsArray(data);
}

export async function saveInternalNews(items: InternalNewsItem[]) {
  const normalized = items.map((item) => normalizeNewsItem(item));
  const { error } = await (supabase as any).rpc("gmt_save_internal_news_items", {
    p_items: normalized,
  });

  if (error) throw error;
}

export function newsMatchesProfile(item: InternalNewsItem, profile: any) {
  if (item.audience === "all") return true;
  const value = String(item.targetValue ?? "").toLowerCase().trim();
  if (!value) return true;
  if (item.audience === "employee") {
    return [profile?.id, profile?.full_name, profile?.email].some((x) => String(x ?? "").toLowerCase().trim() === value);
  }
  if (item.audience === "center") {
    return [profile?.center, profile?.work_center, profile?.location].some((x) => String(x ?? "").toLowerCase().trim() === value);
  }
  if (item.audience === "department") {
    return [profile?.department, profile?.area, profile?.role].some((x) => String(x ?? "").toLowerCase().trim() === value);
  }
  return true;
}

export function getPublishedInternalNewsFromItems(items: InternalNewsItem[], profile: any, nowDate = today()) {
  return items
    .filter((item) => item.active && item.published)
    .filter((item) => (!item.startAt || item.startAt <= nowDate) && (!item.endAt || item.endAt >= nowDate))
    .filter((item) => newsMatchesProfile(item, profile))
    .sort((a, b) => Number(b.featured) - Number(a.featured) || b.updatedAt.localeCompare(a.updatedAt));
}

export function createInternalNewsItem(): InternalNewsItem {
  const now = new Date().toISOString();
  return normalizeNewsItem({
    ...DEFAULT_NEWS_ITEM,
    id: `news-${Date.now()}`,
    title: "Nueva noticia interna",
    subtitle: "Subtítulo opcional para dar contexto a la publicación.",
    summary: "Resumen breve para que el trabajador entienda la noticia en segundos.",
    body: "Escribe aquí el contenido completo. Puedes usar saltos de línea para separar ideas como en un artículo interno.",
    icons: ["📰"],
    icon: "📰",
    imageUrl: "",
    imageUrls: [],
    published: false,
    active: true,
    startAt: today(),
    endAt: plusDays(30),
    createdAt: now,
    updatedAt: now,
    contentBlocks: [],
  });
}

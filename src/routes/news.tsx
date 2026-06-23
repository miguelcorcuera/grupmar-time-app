import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/grupmar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CalendarDays, ChevronLeft, Newspaper, Search, Star, Clock, Building2 } from "lucide-react";
import { getPublishedInternalNewsFromItems, loadPublicInternalNews, NEWS_CATEGORIES, type InternalNewsItem } from "@/lib/grupmarInternalNews";
import { applySavedTheme } from "@/lib/grupmarTheme";
import { useEffect } from "react";

export const Route = createFileRoute("/news")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  head: () => ({ meta: [{ title: "Informativo interno — GrupMar Time" }] }),
  component: NewsPage,
});

type NewsViewMode = "today" | "all";

const todayISO = () => new Date().toISOString().slice(0, 10);

function fmtDate(date: string) {
  if (!date) return "Sin fecha";
  const d = new Date(date + "T12:00:00");
  return d.toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

function groupByDate<T extends { startAt?: string; updatedAt?: string }>(items: T[]) {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const key = item.startAt || item.updatedAt?.slice(0, 10) || "sin-fecha";
    (acc[key] ||= []).push(item);
    return acc;
  }, {});
}

function NewsPage() {
  const { profile, role, signOut } = useProfile();
  const [mode, setMode] = useState<NewsViewMode>("today");
  const [category, setCategory] = useState("Todas");
  const [query, setQuery] = useState("");
  const today = todayISO();
  const [newsRows, setNewsRows] = useState<InternalNewsItem[]>([]);

  useEffect(() => { applySavedTheme(); }, []);

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

  const published = useMemo(() => getPublishedInternalNewsFromItems(newsRows, profile, today), [newsRows, profile, today]);
  const todayItems = useMemo(() => published.filter((item) => (!item.startAt || item.startAt <= today) && (!item.endAt || item.endAt >= today)), [published, today]);

  const filtered = useMemo(() => {
    const base = mode === "today" ? todayItems : published;
    const q = query.trim().toLowerCase();
    return base
      .filter((item) => category === "Todas" || item.category === category)
      .filter((item) => !q || [item.title, item.subtitle, item.summary, item.body, item.category, item.tags, item.author, ...(item.contentBlocks ?? []).map((b) => b.text)].join(" ").toLowerCase().includes(q))
      .sort((a, b) => Number(b.featured) - Number(a.featured) || (b.startAt || "").localeCompare(a.startAt || "") || b.updatedAt.localeCompare(a.updatedAt));
  }, [mode, todayItems, published, category, query]);

  const grouped = groupByDate(filtered);
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
  const categories = ["Todas", ...NEWS_CATEGORIES.filter((c) => published.some((n) => n.category === c))];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#eaf6ff,#f8fafc_42%,#fff7ed)] text-slate-950">
      <header className="sticky top-0 z-50 border-b border-blue-100/80 bg-white/92 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <a href="/" className="flex items-center gap-3" aria-label="grup mar.time">
            <img src="/grupmar-time-brand.png" alt="grup mar.time" className="h-11 w-auto max-w-[178px] object-contain object-left" />
          </a>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm"><a href="/"><ChevronLeft className="mr-1 h-4 w-4" /> Mi jornada</a></Button>
            {role === "admin" && <Button asChild variant="outline" size="sm"><a href="/admin/informativo">Administrar noticias</a></Button>}
            <Button variant="ghost" size="sm" onClick={signOut}>Salir</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <section className="mb-6 rounded-[2rem] border border-sky-100 bg-white/88 p-6 shadow-[0_18px_50px_rgba(31,60,112,.10)] backdrop-blur-xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <Badge className="rounded-full bg-sky-100 px-3 py-1 text-sky-800 hover:bg-sky-100"><Newspaper className="mr-1 h-3.5 w-3.5" /> Informativo interno</Badge>
              <h1 className="mt-3 text-3xl font-black tracking-tight">Noticias y publicaciones internas</h1>
              <p className="mt-1 text-sm text-slate-500">Lee comunicados, entrevistas, eventos, fotos, logros y novedades publicadas por Marketing/RRHH.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant={mode === "today" ? "default" : "outline"} onClick={() => setMode("today")}>Noticias de hoy</Button>
              <Button variant={mode === "all" ? "default" : "outline"} onClick={() => setMode("all")}>Todas</Button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-[1fr_260px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por título, contenido, etiqueta o categoría..." className="w-full rounded-2xl border border-slate-200 bg-white px-9 py-2.5 text-sm font-semibold outline-none focus:border-sky-300" />
            </div>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-sky-300">
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </section>

        {!filtered.length ? (
          <Card className="rounded-[2rem] border border-slate-200 bg-white/88 p-8 text-center shadow-sm">
            <Newspaper className="mx-auto mb-3 h-10 w-10 text-slate-400" />
            <h2 className="text-xl font-black">No hay noticias visibles</h2>
            <p className="mt-1 text-sm text-slate-500">No existen publicaciones publicadas para tu usuario con los filtros seleccionados.</p>
          </Card>
        ) : (
          <div className="space-y-8">
            {sortedDates.map((date) => (
              <section key={date}>
                <div className="mb-3 flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-sky-100 text-sky-800"><CalendarDays className="h-5 w-5" /></div>
                  <div>
                    <h2 className="text-lg font-black capitalize">{date === today ? "Noticias de hoy" : fmtDate(date)}</h2>
                    <p className="text-xs font-semibold text-slate-500">{grouped[date].length} publicación(es)</p>
                  </div>
                </div>
                <div className="space-y-5">
                  {grouped[date].map((item) => <PublishedNewsArticle key={item.id} item={item} />)}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function PublishedNewsArticle({ item }: { item: InternalNewsItem }) {
  const images = item.imageUrls?.length ? item.imageUrls : item.imageUrl ? [item.imageUrl] : [];
  const hero = images[0];
  const gallery = images.slice(1, 7);
  const radius = item.borderRadius ?? "28px";
  const isMagazine = item.layout === "magazine";
  const isGallery = item.layout === "gallery";
  const isNewspaper = item.layout === "newspaper";
  const isInterview = item.layout === "interview";

  return (
    <article className="overflow-hidden border bg-white shadow-[0_14px_40px_rgba(15,23,42,.08)]" style={{ borderColor: item.border, borderRadius: radius }}>
      {item.headerStyle === "banner" && (
        <div className="px-6 py-3 text-xs font-black uppercase tracking-[0.18em] text-white" style={{ background: item.accent }}>
          {(item.icons ?? [item.icon]).join(" ")} {item.category}
        </div>
      )}
      {hero && item.showHero !== false && (
        <div className={isMagazine || isGallery ? "grid gap-0 md:grid-cols-[1.3fr_.7fr]" : ""}>
          <img src={hero} alt={item.title} className="h-[320px] w-full object-cover" />
          {(isMagazine || isGallery) && gallery.length > 0 && (
            <div className="grid grid-cols-2">
              {gallery.map((img, idx) => <img key={idx} src={img} alt={`Foto ${idx + 2}`} className="h-40 w-full object-cover" />)}
            </div>
          )}
        </div>
      )}
      <div className={`p-6 md:p-8 ${item.headerStyle === "left-border" ? "border-l-[10px]" : ""}`} style={{ background: item.background, color: item.textColor, fontFamily: item.fontFamily, borderLeftColor: item.accent }}>
        {item.headerStyle !== "banner" && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge className="rounded-full border border-white/40 px-3 py-1 text-xs font-black" style={{ background: item.accent, color: "white" }}>{item.category}</Badge>
            {item.featured && <Badge className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800"><Star className="mr-1 h-3 w-3" /> Destacada</Badge>}
            <span className="text-xl">{item.icons?.join(" ") || item.icon || "📰"}</span>
          </div>
        )}
        <h3 className={isNewspaper ? "font-serif text-3xl font-black leading-tight md:text-4xl" : "text-2xl font-black leading-tight md:text-3xl"} style={{ color: item.headlineColor ?? item.textColor }}>{item.title}</h3>
        {item.subtitle && <p className="mt-2 text-lg font-semibold opacity-80">{item.subtitle}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-bold opacity-70">
          {item.author && <span>Por {item.author}</span>}
          {item.tags && <span>{item.tags}</span>}
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {fmtDate(item.startAt)}</span>
          <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {item.audience === "all" ? "Todos" : item.audience}</span>
        </div>
        <p className="mt-5 text-base font-bold leading-relaxed opacity-85">{item.summary}</p>
        <p className={`${isNewspaper ? "md:columns-2" : ""} mt-5 whitespace-pre-line text-sm leading-7 opacity-90`}>{item.body}</p>
        {(item.contentBlocks ?? []).map((block) => {
          if (block.type === "subtitle") return <h4 key={block.id} className="mt-6 text-xl font-black" style={{ color: item.headlineColor ?? item.textColor }}>{block.text}</h4>;
          if (block.type === "quote") return <blockquote key={block.id} className="mt-6 rounded-2xl border-l-4 bg-white/45 px-5 py-4 text-lg font-semibold italic" style={{ borderLeftColor: item.accent }}>{block.text}</blockquote>;
          if (block.type === "highlight") return <div key={block.id} className="mt-6 rounded-2xl px-5 py-4 text-sm font-black" style={{ background: item.accent, color: "white" }}>{block.text}</div>;
          return <p key={block.id} className="mt-4 whitespace-pre-line text-sm leading-7 opacity-90">{block.text}</p>;
        })}
        {isInterview && <div className="mt-6 rounded-2xl border border-black/10 bg-white/40 p-4 text-xs font-bold opacity-75">Publicación tipo entrevista: ideal para destacar personal, mejoras, aprendizajes y testimonios.</div>}
      </div>
    </article>
  );
}

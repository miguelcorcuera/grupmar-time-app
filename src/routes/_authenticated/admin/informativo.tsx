import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createInternalNewsItem,
  createNewsBlock,
  NEWS_CATEGORIES,
  NEWS_EMOJIS,
  NEWS_HEADER_STYLES,
  NEWS_LAYOUTS,
  loadAdminInternalNews,
  saveInternalNews,
  type InternalNewsItem,
  type InternalNewsAudience,
  type InternalNewsBlockType,
  type InternalNewsLayout,
  type InternalNewsHeaderStyle,
} from "@/lib/grupmarInternalNews";
import { ADMIN_BUILD_VERSION } from "@/lib/grupmarAdminLocal";
import { Eye, ImagePlus, Newspaper, Plus, Save, Send, Trash2, Upload, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/informativo")({ component: InternalNewsAdmin });

const palettes = [
  { name: "Periódico claro", background: "#ffffff", border: "#bfdbfe", textColor: "#0f172a", accent: "#2563eb", headlineColor: "#0f172a" },
  { name: "Celeste editorial", background: "#eff6ff", border: "#93c5fd", textColor: "#0f172a", accent: "#0284c7", headlineColor: "#082f49" },
  { name: "Éxito / logro", background: "#ecfdf5", border: "#86efac", textColor: "#052e16", accent: "#16a34a", headlineColor: "#052e16" },
  { name: "Evento cálido", background: "#fff7ed", border: "#fdba74", textColor: "#431407", accent: "#f97316", headlineColor: "#431407" },
  { name: "Premium oscuro", background: "#0f172a", border: "#334155", textColor: "#f8fafc", accent: "#38bdf8", headlineColor: "#ffffff" },
];

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function InternalNewsAdmin() {
  const [items, setItems] = useState<InternalNewsItem[]>([]);
  const [selectedId, setSelectedId] = useState(() => items[0]?.id ?? "");
  const [imageUrlDraft, setImageUrlDraft] = useState("");
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? items[0], [items, selectedId]);

  useEffect(() => {
    let alive = true;

    loadAdminInternalNews()
      .then((rows) => {
        if (!alive) return;
        setItems(rows);
        setSelectedId(rows[0]?.id ?? "");
      })
      .catch((err) => {
        console.error(err);
        toast.error("No se pudo cargar el informativo desde Supabase.");
      });

    return () => {
      alive = false;
    };
  }, []);

  function update(patch: Partial<InternalNewsItem>) {
    if (!selected) return;
    setItems((prev) => prev.map((item) => item.id === selected.id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item));
  }

  async function save() {
    try {
      await saveInternalNews(items);
      toast.success("Informativo guardado en Supabase.");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "No se pudo guardar el informativo en Supabase.");
    }
  }

  async function publish() {
    if (!selected) return;
    const next = items.map((item) => item.id === selected.id ? { ...item, active: true, published: true, updatedAt: new Date().toISOString() } : item);
    setItems(next);
    try {
      await saveInternalNews(next);
      toast.success("Noticia publicada para los trabajadores correspondientes.");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "No se pudo publicar en Supabase.");
    }
  }

  function unpublish() {
    if (!selected) return;
    const next = items.map((item) => item.id === selected.id ? { ...item, published: false, updatedAt: new Date().toISOString() } : item);
    setItems(next);
    saveInternalNews(next);
    toast.info("Publicación retirada. Queda como borrador.");
  }

  function add() {
    const item = createInternalNewsItem();
    const next = [item, ...items];
    setItems(next);
    setSelectedId(item.id);
  }

  async function remove() {
    if (!selected) return;
    const next = items.filter((item) => item.id !== selected.id);
    setItems(next);
    setSelectedId(next[0]?.id ?? "");
    try {
      await saveInternalNews(next);
      toast.success("Noticia eliminada.");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "No se pudo eliminar la noticia en Supabase.");
    }
  }

  function toggleEmoji(emoji: string) {
    if (!selected) return;
    const current = selected.icons ?? [];
    const next = current.includes(emoji) ? current.filter((x) => x !== emoji) : [...current, emoji];
    update({ icons: next, icon: next[0] ?? "📰" });
  }

  async function addImageFiles(files: FileList | File[]) {
    if (!selected) return;
    const images = [...files].filter((file) => file.type.startsWith("image/"));
    if (!images.length) return;
    const urls = await Promise.all(images.map(fileToDataUrl));
    const next = [...(selected.imageUrls ?? []), ...urls];
    update({ imageUrls: next, imageUrl: next[0] ?? "" });
    toast.success(`${urls.length} imagen(es) agregada(s).`);
  }

  function addImageUrl() {
    const url = imageUrlDraft.trim();
    if (!selected || !url) return;
    const next = [...(selected.imageUrls ?? []), url];
    update({ imageUrls: next, imageUrl: next[0] ?? "" });
    setImageUrlDraft("");
  }

  function removeImage(index: number) {
    if (!selected) return;
    const next = (selected.imageUrls ?? []).filter((_, i) => i !== index);
    update({ imageUrls: next, imageUrl: next[0] ?? "" });
  }

  function setHero(index: number) {
    if (!selected) return;
    const list = selected.imageUrls ?? [];
    const img = list[index];
    if (!img) return;
    const next = [img, ...list.filter((_, i) => i !== index)];
    update({ imageUrls: next, imageUrl: img });
  }

  function addBlock(type: InternalNewsBlockType) {
    if (!selected) return;
    const text = type === "subtitle" ? "Nuevo subtítulo de sección" : type === "quote" ? "“Escribe aquí una frase destacada.”" : type === "highlight" ? "Dato destacado o mejora importante." : "Nuevo párrafo de la noticia.";
    update({ contentBlocks: [...(selected.contentBlocks ?? []), createNewsBlock(type, text)] });
  }

  function updateBlock(id: string, patch: { type?: InternalNewsBlockType; text?: string }) {
    if (!selected) return;
    update({ contentBlocks: (selected.contentBlocks ?? []).map((b) => b.id === id ? { ...b, ...patch } : b) });
  }

  function removeBlock(id: string) {
    if (!selected) return;
    update({ contentBlocks: (selected.contentBlocks ?? []).filter((b) => b.id !== id) });
  }

  if (!selected) {
    return (
      <div className="gmt-shell p-6">
        <Button onClick={add}><Plus className="h-4 w-4 mr-2" /> Crear primera noticia</Button>
      </div>
    );
  }

  const selectedImages = selected.imageUrls ?? [];

  return (
    <div className="gmt-shell p-4 md:p-6">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <Badge className="rounded-full border border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-50">{ADMIN_BUILD_VERSION}</Badge>
          <h1 className="mt-3 text-2xl font-black text-slate-950">Informativo interno</h1>
          <p className="text-sm text-slate-500">Mini editor tipo periódico/WordPress para noticias, entrevistas, fotos, eventos y comunicados de Marketing/RRHH.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={add}><Plus className="h-4 w-4 mr-2" /> Nueva noticia</Button>
          <Button variant="outline" onClick={save}><Save className="h-4 w-4 mr-2" /> Guardar borrador</Button>
          {selected.published ? <Button variant="outline" onClick={unpublish}>Retirar publicación</Button> : <Button onClick={publish}><Send className="h-4 w-4 mr-2" /> Publicar</Button>}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[290px_1fr_520px]">
        <Card className="rounded-3xl border border-slate-200 bg-white/90 p-3 shadow-sm">
          <div className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-slate-500">Publicaciones</div>
          <div className="space-y-2">
            {items.map((item) => (
              <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`w-full rounded-2xl border p-3 text-left transition ${item.id === selected.id ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                <div className="font-black text-slate-900">{(item.icons ?? [item.icon]).join(" ")} {item.title}</div>
                <div className="mt-1 text-xs text-slate-500">{item.published ? "Publicado" : "Borrador"} · {item.category}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Título principal</Label>
              <Input value={selected.title} onChange={(e) => update({ title: e.target.value })} />
            </div>
            <div>
              <Label>Categoría</Label>
              <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" value={selected.category} onChange={(e) => update({ category: e.target.value })}>
                {NEWS_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <Label>Subtítulo / bajada</Label>
              <Input value={selected.subtitle ?? ""} onChange={(e) => update({ subtitle: e.target.value })} />
            </div>
            <div>
              <Label>Autor / equipo</Label>
              <Input value={selected.author ?? ""} onChange={(e) => update({ author: e.target.value })} placeholder="Marketing / RRHH" />
            </div>
            <div className="md:col-span-2">
              <Label>Resumen corto</Label>
              <Input value={selected.summary} onChange={(e) => update({ summary: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>Contenido principal</Label>
              <Textarea className="min-h-[140px]" value={selected.body} onChange={(e) => update({ body: e.target.value })} />
            </div>
          </div>

          <div className="mt-4 rounded-3xl border border-sky-100 bg-sky-50/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-black text-slate-900">Diseño de la noticia</div>
                <p className="text-xs text-slate-500">Elige un estilo tipo periódico, revista, entrevista o galería.</p>
              </div>
              <Eye className="h-5 w-5 text-sky-700" />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>Plantilla</Label>
                <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" value={selected.layout ?? "classic"} onChange={(e) => update({ layout: e.target.value as InternalNewsLayout })}>
                  {NEWS_LAYOUTS.map((layout) => <option key={layout.id} value={layout.id}>{layout.label}</option>)}
                </select>
              </div>
              <div>
                <Label>Cabecera</Label>
                <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" value={selected.headerStyle ?? "clean"} onChange={(e) => update({ headerStyle: e.target.value as InternalNewsHeaderStyle })}>
                  {NEWS_HEADER_STYLES.map((style) => <option key={style.id} value={style.id}>{style.label}</option>)}
                </select>
              </div>
              <div>
                <Label>Radio bordes</Label>
                <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" value={selected.borderRadius ?? "28px"} onChange={(e) => update({ borderRadius: e.target.value })}>
                  <option value="16px">Suave</option>
                  <option value="28px">Redondeado</option>
                  <option value="40px">Muy redondeado</option>
                  <option value="0px">Periódico recto</option>
                </select>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900"><ImagePlus className="h-5 w-5" /> Imágenes / fotos</div>
            <div
              className="rounded-3xl border-2 border-dashed border-sky-200 bg-sky-50/60 p-5 text-center"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); addImageFiles(e.dataTransfer.files); }}
            >
              <Upload className="mx-auto mb-2 h-7 w-7 text-sky-700" />
              <p className="text-sm font-black text-slate-800">Arrastra aquí una o varias imágenes</p>
              <p className="text-xs text-slate-500">También puedes seleccionarlas desde tu equipo o pegar una URL.</p>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && addImageFiles(e.target.files)} />
              <Button type="button" variant="outline" className="mt-3" onClick={() => fileInputRef.current?.click()}>Seleccionar fotos</Button>
            </div>
            <div className="mt-3 flex gap-2">
              <Input value={imageUrlDraft} onChange={(e) => setImageUrlDraft(e.target.value)} placeholder="Pegar URL de imagen https://..." />
              <Button type="button" variant="outline" onClick={addImageUrl}>Agregar URL</Button>
            </div>
            {selectedImages.length > 0 && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {selectedImages.map((img, index) => (
                  <div key={`${img}-${index}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <img src={img} alt={`Imagen ${index + 1}`} className="h-32 w-full object-cover" />
                    <div className="flex items-center justify-between p-2">
                      <span className="text-xs font-bold text-slate-500">{index === 0 ? "Portada" : `Foto ${index + 1}`}</span>
                      <div className="flex gap-1">
                        {index !== 0 && <Button type="button" size="sm" variant="outline" onClick={() => setHero(index)}>Portada</Button>}
                        <Button type="button" size="sm" variant="outline" onClick={() => removeImage(index)}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-4">
            <div className="mb-3 text-sm font-black text-slate-900">Bloques tipo WordPress mini</div>
            <div className="mb-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => addBlock("subtitle")}>+ Subtítulo</Button>
              <Button type="button" variant="outline" onClick={() => addBlock("paragraph")}>+ Párrafo</Button>
              <Button type="button" variant="outline" onClick={() => addBlock("quote")}>+ Cita</Button>
              <Button type="button" variant="outline" onClick={() => addBlock("highlight")}>+ Destacado</Button>
            </div>
            <div className="space-y-3">
              {(selected.contentBlocks ?? []).map((block) => (
                <div key={block.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex gap-2">
                    <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black" value={block.type} onChange={(e) => updateBlock(block.id, { type: e.target.value as InternalNewsBlockType })}>
                      <option value="subtitle">Subtítulo</option>
                      <option value="paragraph">Párrafo</option>
                      <option value="quote">Cita</option>
                      <option value="highlight">Destacado</option>
                    </select>
                    <Button type="button" size="sm" variant="outline" onClick={() => removeBlock(block.id)}>Eliminar</Button>
                  </div>
                  <Textarea value={block.text} onChange={(e) => updateBlock(block.id, { text: e.target.value })} />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 p-3">
            <div className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-slate-500">Paleta y estilo</div>
            <div className="mb-3 flex flex-wrap gap-2">
              {palettes.map((p) => <Button key={p.name} type="button" variant="outline" onClick={() => update(p)}>{p.name}</Button>)}
            </div>
            <div className="grid gap-3 md:grid-cols-6">
              <div><Label>Fondo</Label><Input type="color" value={selected.background} onChange={(e) => update({ background: e.target.value })} /></div>
              <div><Label>Borde</Label><Input type="color" value={selected.border} onChange={(e) => update({ border: e.target.value })} /></div>
              <div><Label>Texto</Label><Input type="color" value={selected.textColor} onChange={(e) => update({ textColor: e.target.value })} /></div>
              <div><Label>Titular</Label><Input type="color" value={selected.headlineColor ?? selected.textColor} onChange={(e) => update({ headlineColor: e.target.value })} /></div>
              <div><Label>Acento</Label><Input type="color" value={selected.accent} onChange={(e) => update({ accent: e.target.value })} /></div>
              <div><Label>Fuente</Label><select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" value={selected.fontFamily} onChange={(e) => update({ fontFamily: e.target.value })}><option>Arial</option><option>Calibri</option><option>Georgia</option><option>Verdana</option><option>Trebuchet MS</option></select></div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <Label>Dirigido a</Label>
              <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" value={selected.audience} onChange={(e) => update({ audience: e.target.value as InternalNewsAudience })}>
                <option value="all">Todos</option>
                <option value="employee">Trabajador</option>
                <option value="center">Centro</option>
                <option value="department">Departamento</option>
              </select>
            </div>
            <div>
              <Label>Valor destino</Label>
              <Input value={selected.targetValue ?? ""} onChange={(e) => update({ targetValue: e.target.value })} placeholder="Nombre, email, centro o departamento" />
            </div>
            <div>
              <Label>Desde</Label>
              <Input type="date" value={selected.startAt} onChange={(e) => update({ startAt: e.target.value })} />
            </div>
            <div>
              <Label>Hasta</Label>
              <Input type="date" value={selected.endAt} onChange={(e) => update({ endAt: e.target.value })} />
            </div>
          </div>

          <div className="mt-4 flex justify-between">
            <Button variant="destructive" onClick={remove}><Trash2 className="h-4 w-4 mr-2" /> Eliminar</Button>
            <Button onClick={save}><Save className="h-4 w-4 mr-2" /> Guardar cambios</Button>
          </div>
        </Card>

        <Card className="rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-black text-slate-700">Preview antes de publicar</div>
            <div className="flex gap-2">
              <Button size="sm" variant={previewMode === "desktop" ? "default" : "outline"} onClick={() => setPreviewMode("desktop")}>Desktop</Button>
              <Button size="sm" variant={previewMode === "mobile" ? "default" : "outline"} onClick={() => setPreviewMode("mobile")}>Móvil</Button>
            </div>
          </div>
          <div className={previewMode === "mobile" ? "mx-auto max-w-[360px]" : ""}>
            <NewsArticlePreview item={selected} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function NewsArticlePreview({ item }: { item: InternalNewsItem }) {
  const images = item.imageUrls?.length ? item.imageUrls : item.imageUrl ? [item.imageUrl] : [];
  const hero = images[0];
  const gallery = images.slice(1, 5);
  const radius = item.borderRadius ?? "28px";
  const isMagazine = item.layout === "magazine";
  const isNewspaper = item.layout === "newspaper";
  const isGallery = item.layout === "gallery";
  const isInterview = item.layout === "interview";

  return (
    <article className="overflow-hidden border shadow-sm" style={{ borderColor: item.border, borderRadius: radius }}>
      {item.headerStyle === "banner" && (
        <div className="px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-white" style={{ background: item.accent }}>
          {(item.icons ?? [item.icon]).join(" ")} {item.category}
        </div>
      )}
      {hero && item.showHero !== false && (
        <div className={isMagazine || isGallery ? "grid gap-0 md:grid-cols-[1.3fr_.7fr]" : ""}>
          <img src={hero} alt={item.title} className="h-60 w-full object-cover" />
          {(isMagazine || isGallery) && gallery.length > 0 && (
            <div className="grid grid-cols-2">
              {gallery.map((img, idx) => <img key={idx} src={img} alt={`Foto ${idx + 2}`} className="h-30 min-h-[120px] w-full object-cover" />)}
            </div>
          )}
        </div>
      )}
      <div className={`p-6 ${item.headerStyle === "left-border" ? "border-l-[8px]" : ""}`} style={{ background: item.background, color: item.textColor, fontFamily: item.fontFamily, borderLeftColor: item.accent }}>
        {item.headerStyle !== "banner" && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge className="rounded-full border border-white/40 px-3 py-1 text-xs font-black" style={{ background: item.accent, color: "white" }}>{item.category}</Badge>
            <span className="text-xl">{item.icons?.join(" ") || item.icon || "📰"}</span>
          </div>
        )}
        <h2 className={isNewspaper ? "font-serif text-3xl font-black leading-tight" : "text-2xl font-black leading-tight"} style={{ color: item.headlineColor ?? item.textColor }}>{item.title}</h2>
        {item.subtitle && <p className="mt-2 text-lg font-semibold opacity-80">{item.subtitle}</p>}
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold opacity-70">
          {item.author && <span>Por {item.author}</span>}
          {item.tags && <span>· {item.tags}</span>}
        </div>
        <p className="mt-4 text-sm font-bold leading-relaxed opacity-85">{item.summary}</p>
        <p className={`${isNewspaper ? "md:columns-2" : ""} mt-5 whitespace-pre-line text-sm leading-7 opacity-90`}>{item.body}</p>
        {(item.contentBlocks ?? []).map((block) => {
          if (block.type === "subtitle") return <h3 key={block.id} className="mt-5 text-lg font-black" style={{ color: item.headlineColor ?? item.textColor }}>{block.text}</h3>;
          if (block.type === "quote") return <blockquote key={block.id} className="mt-5 rounded-2xl border-l-4 bg-white/45 px-4 py-3 text-base font-semibold italic" style={{ borderLeftColor: item.accent }}>{block.text}</blockquote>;
          if (block.type === "highlight") return <div key={block.id} className="mt-5 rounded-2xl px-4 py-3 text-sm font-black" style={{ background: item.accent, color: "white" }}>{block.text}</div>;
          return <p key={block.id} className="mt-4 whitespace-pre-line text-sm leading-7 opacity-90">{block.text}</p>;
        })}
        {isInterview && <div className="mt-5 rounded-2xl border border-black/10 bg-white/40 p-4 text-xs font-bold opacity-75">Formato entrevista: combina preguntas, respuestas y citas destacadas en los bloques de contenido.</div>}
      </div>
    </article>
  );
}

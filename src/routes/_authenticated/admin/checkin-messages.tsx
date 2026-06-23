import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  EMOJI_CATEGORIES,
  FONT_OPTIONS,
  PALETTE_OPTIONS,
  type CheckinMessageSettings,
  type CompanyTickerMessage,
  type CheckinTemplate,
  type ManualCheckinMessage,
  newManualCheckinMessage,
  readCheckinMessageSettings,
  saveCheckinMessageSettings,
  loadCheckinMessageSettingsFromDb,
  readCompanyTickerSettings,
  saveCompanyTickerSettings,
  loadCompanyTickerSettingsFromDb,
  newCompanyTickerMessage,
} from "@/lib/grupmarCheckinMessages";

export const Route = createFileRoute("/_authenticated/admin/checkin-messages")({ component: CheckinMessagesAdmin });

type EmployeeRow = { id: string; full_name: string; email?: string; center?: string; department?: string; active?: boolean };

const TYPE_OPTIONS = [
  { value: "promotion", label: "Ascenso", icon: "👏" },
  { value: "responsibility", label: "Nueva responsabilidad", icon: "🧭" },
  { value: "recognition", label: "Reconocimiento", icon: "🏆" },
  { value: "welcome", label: "Bienvenida", icon: "👋" },
  { value: "birthday", label: "Cumpleaños manual", icon: "🎂" },
  { value: "farewell", label: "Salida / despedida", icon: "🤝" },
  { value: "trip", label: "Viaje / traslado", icon: "✈️" },
  { value: "condolence", label: "Fallecimiento / condolencias", icon: "🕊️" },
  { value: "custom", label: "Personalizado", icon: "✨" },
] as const;

const VARIABLE_TOKENS = ["{nombre}", "{nombre_completo}", "{destinatario}", "{destinatario_completo}"];

function templateToManual(template: CheckinTemplate, name: string): ManualCheckinMessage {
  return {
    id: `preview-${name}`,
    enabled: true,
    type: "custom",
    name,
    title: template.title,
    body: template.body,
    targetMode: "all",
    targetValue: "",
    subjectEmployeeId: "",
    subjectName: "",
    subjectEmail: "",
    subjectCenter: "",
    subjectDepartment: "",
    startDate: "",
    endDate: "",
    style: { ...template.style, icon: template.icon || template.style.icon },
  };
}

function applyPaletteToStyle(style: ManualCheckinMessage["style"], paletteName: string) {
  const palette = PALETTE_OPTIONS.find((p) => p.name === paletteName);
  return palette ? { ...style, background: palette.background, border: palette.border, text: palette.text, accent: palette.accent } : style;
}

function uniqueSorted(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.map((v) => String(v || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function insertToken(value: string, token: string) {
  return `${value || ""}${value ? " " : ""}${token}`;
}

function manualTemplateForType(type: string, icon = "🎉") {
  switch (type) {
    case "promotion":
      return {
        title: `${icon} Felicitaciones a {nombre_completo} por tu ascenso`,
        body: `En Grupo Marport reconocemos el esfuerzo y compromiso de {nombre_completo}. Estamos orgullosos de esta nueva etapa y le deseamos muchos éxitos.`,
      };
    case "responsibility":
      return {
        title: `${icon} Nueva responsabilidad para {nombre_completo}`,
        body: `{nombre_completo} asume una nueva responsabilidad dentro del equipo. Gracias por tu compromiso y por seguir aportando al crecimiento de Grupo Marport.`,
      };
    case "recognition":
      return {
        title: `${icon} Reconocimiento especial para {nombre_completo}`,
        body: `Reconocemos públicamente el esfuerzo, actitud y compromiso de {nombre_completo}. Gracias por sumar al equipo.`,
      };
    case "welcome":
      return {
        title: `${icon} Bienvenido/a, {nombre_completo}`,
        body: `Damos la bienvenida a {nombre_completo}. Le deseamos muchos éxitos en esta nueva etapa dentro de Grupo Marport.`,
      };
    case "farewell":
      return {
        title: `${icon} Gracias por todo, {nombre_completo}`,
        body: `Agradecemos a {nombre_completo} por su tiempo, dedicación y aporte al equipo. Le deseamos lo mejor en sus próximos proyectos.`,
      };
    case "trip":
      return {
        title: `${icon} Nuevo cambio para {nombre_completo}`,
        body: `{nombre_completo} inicia una nueva etapa, traslado o cambio operativo. Le deseamos una excelente adaptación y muchos éxitos.`,
      };
    case "condolence":
      return {
        title: `${icon} Acompañamos a {nombre_completo}`,
        body: `Desde Grupo Marport acompañamos a {nombre_completo} y a su familia en este momento. Recibe nuestro apoyo y respeto.`,
      };
    default:
      return {
        title: `${icon} Mensaje para {nombre_completo}`,
        body: `Comunicado especial dirigido a {nombre_completo}.`,
      };
  }
}

function previewTokens(text: string, fullName?: string) {
  const name = fullName || "Pepito Grillo";
  const first = String(name).split(" ")[0] || name;
  return String(text || "")
    .replaceAll("{nombre}", first)
    .replaceAll("{nombre_completo}", name)
    .replaceAll("{destinatario}", first)
    .replaceAll("{destinatario_completo}", name);
}

function CheckinMessagesAdmin() {
  const [settings, setSettings] = useState<CheckinMessageSettings>(() => readCheckinMessageSettings());
  const [tickerSettings, setTickerSettings] = useState(() => readCompanyTickerSettings());
  const [selectedTickerId, setSelectedTickerId] = useState(tickerSettings.messages[0]?.id ?? "");
  const [selectedManualId, setSelectedManualId] = useState(settings.manual[0]?.id ?? "");
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);

  useEffect(() => {
    let alive = true;

    Promise.all([
      loadCheckinMessageSettingsFromDb(),
      loadCompanyTickerSettingsFromDb(),
      (supabase as any)
        .from("profiles")
        .select("id, full_name, email, work_center, department, active")
        .eq("active", true)
        .order("full_name"),
    ])
      .then(([dbSettings, dbTickerSettings, employeesRes]) => {
        if (!alive) return;

        setSettings(dbSettings);
        setTickerSettings(dbTickerSettings);
        setSelectedManualId(dbSettings.manual[0]?.id ?? "");
        setSelectedTickerId(dbTickerSettings.messages[0]?.id ?? "");

        if (employeesRes?.error) {
          console.error("[GrupMar Time] No se pudieron cargar trabajadores desde profiles", employeesRes.error);
          toast.error("No se pudieron cargar trabajadores desde Supabase.");
        } else {
          setEmployees(((employeesRes?.data ?? []) as any[]).map((p) => ({
            id: p.id,
            full_name: p.full_name || p.email || "Trabajador sin nombre",
            email: p.email ?? "",
            center: p.work_center ?? "",
            department: p.department ?? "",
            active: p.active,
          })));
        }
      })
      .catch((error) => {
        console.error("[GrupMar Time] No se pudieron cargar comunicados/marquesina desde BD", error);
        toast.error("No se pudieron cargar los comunicados desde la BD.");
      });

    return () => {
      alive = false;
    };
  }, []);

  const [emojiCategory, setEmojiCategory] = useState(EMOJI_CATEGORIES[0]?.name ?? "Celebración");

  const centers = useMemo(() => uniqueSorted(employees.map((e) => e.center)), [employees]);
  const departments = useMemo(() => uniqueSorted(employees.map((e) => e.department)), [employees]);
  const selectedManual = settings.manual.find((m) => m.id === selectedManualId) ?? settings.manual[0];
  const selectedTicker = tickerSettings.messages.find((m) => m.id === selectedTickerId) ?? tickerSettings.messages[0];
  const selectedEmployee = selectedManual?.targetMode === "employee" ? employees.find((e) => e.id === selectedManual.targetValue) : undefined;
  const selectedSubjectEmployee = selectedManual?.subjectEmployeeId ? employees.find((e) => e.id === selectedManual.subjectEmployeeId) : undefined;
  const previewSubjectName = selectedManual?.subjectName || selectedSubjectEmployee?.full_name || (selectedManual?.targetMode === "employee" ? selectedEmployee?.full_name : "Pepito Grillo");
  const currentEmojiList = EMOJI_CATEGORIES.find((c) => c.name === emojiCategory)?.emojis ?? EMOJI_CATEGORIES[0]?.emojis ?? [];

  function iconList(value?: string) {
    return String(value || "").split(/\s+/).map((x) => x.trim()).filter(Boolean);
  }

  function toggleIconString(current: string | undefined, emoji: string) {
    const list = iconList(current);
    return list.includes(emoji) ? list.filter((x) => x !== emoji).join(" ") : [...list, emoji].join(" ");
  }

  function appendIconString(current: string | undefined, emoji: string) {
    const list = iconList(current);
    return list.includes(emoji) ? list.join(" ") : [...list, emoji].join(" ");
  }

  function selectedIconPills(value: string, onRemove: (emoji: string) => void) {
    const list = iconList(value);
    if (!list.length) return <span className="text-xs font-medium text-slate-400">Sin iconos seleccionados.</span>;
    return (
      <div className="flex flex-wrap gap-1.5">
        {list.map((emoji) => (
          <button key={emoji} type="button" onClick={() => onRemove(emoji)} className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-sm font-black text-sky-900 hover:bg-rose-50 hover:text-rose-700" title="Quitar icono">
            {emoji} ×
          </button>
        ))}
      </div>
    );
  }

  function persist(next: CheckinMessageSettings) {
    setSettings(next);
    saveCheckinMessageSettings(next);
  }

  function updateAuto(kind: "birthday" | "saint", patch: Partial<CheckinTemplate>) {
    persist({ ...settings, automatic: { ...settings.automatic, [kind]: { ...settings.automatic[kind], ...patch } } });
  }

  function updateAutoStyle(kind: "birthday" | "saint", patch: Partial<CheckinTemplate["style"]>) {
    const t = settings.automatic[kind];
    persist({ ...settings, automatic: { ...settings.automatic, [kind]: { ...t, style: { ...t.style, ...patch } } } });
  }

  function updateManual(id: string, patch: Partial<ManualCheckinMessage>) {
    persist({ ...settings, manual: settings.manual.map((m) => m.id === id ? { ...m, ...patch } : m) });
  }

  function updateManualStyle(id: string, patch: Partial<ManualCheckinMessage["style"]>) {
    persist({ ...settings, manual: settings.manual.map((m) => m.id === id ? { ...m, style: { ...m.style, ...patch } } : m) });
  }

  function updateManualSubject(id: string, employeeId: string) {
    const employee = employees.find((e) => e.id === employeeId);
    updateManual(id, {
      subjectEmployeeId: employee?.id || "",
      subjectName: employee?.full_name || "",
      subjectEmail: employee?.email || "",
      subjectCenter: employee?.center || "",
      subjectDepartment: employee?.department || "",
    } as any);
  }

  function applyManualTemplate(message: ManualCheckinMessage) {
    const selected = TYPE_OPTIONS.find((t) => t.value === message.type);
    const tpl = manualTemplateForType(message.type, selected?.icon || message.style.icon || "🎉");
    updateManual(message.id, tpl as any);
    toast.success("Plantilla aplicada con nombre dinámico.");
  }

  function addManual() {
    const msg = newManualCheckinMessage();
    persist({ ...settings, manual: [msg, ...settings.manual] });
    setSelectedManualId(msg.id);
  }

  function deleteManual(id: string) {
    const next = settings.manual.filter((m) => m.id !== id);
    persist({ ...settings, manual: next });
    setSelectedManualId(next[0]?.id ?? "");
  }

  function persistTicker(next: typeof tickerSettings) {
    setTickerSettings(next);
    saveCompanyTickerSettings(next);
  }

  function updateTicker(id: string, patch: Partial<CompanyTickerMessage>, keepPublished = false) {
    const isPublicationPatch = Object.prototype.hasOwnProperty.call(patch, "published") || Object.prototype.hasOwnProperty.call(patch, "publishedAt");
    persistTicker({
      ...tickerSettings,
      messages: tickerSettings.messages.map((m) => m.id === id ? { ...m, ...patch, ...(keepPublished || isPublicationPatch ? {} : { published: false }) } : m),
    });
  }

  function addTicker() {
    const msg = newCompanyTickerMessage();
    persistTicker({ ...tickerSettings, messages: [msg, ...tickerSettings.messages] });
    setSelectedTickerId(msg.id);
  }

  function deleteTicker(id: string) {
    const next = tickerSettings.messages.filter((m) => m.id !== id);
    persistTicker({ ...tickerSettings, messages: next });
    setSelectedTickerId(next[0]?.id ?? "");
  }

  function tomorrowDate() {
    return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  function tickerStatusLabel(message: CompanyTickerMessage) {
    if (!message.published) return "Borrador no publicado";
    if (message.publishMode === "default24h") return "Publicado 24h";
    return `Publicado del ${message.startDate || "—"} al ${message.endDate || "—"}`;
  }

  function publishTicker(message: CompanyTickerMessage) {
    const today = new Date().toISOString().slice(0, 10);
    updateTicker(message.id, {
      enabled: true,
      published: true,
      publishedAt: new Date().toISOString(),
      startDate: message.publishMode === "default24h" ? today : message.startDate,
      endDate: message.publishMode === "default24h" ? tomorrowDate() : message.endDate,
    }, true);
    toast.success(message.publishMode === "default24h" ? "Aviso publicado por 24 horas." : "Aviso publicado según el rango de fechas.");
  }

  function unpublishTicker(message: CompanyTickerMessage) {
    updateTicker(message.id, { published: false }, true);
    toast.info("Aviso retirado de la marquesina pública.");
  }

  function saveTickerDraft() {
    saveCompanyTickerSettings(tickerSettings);
    toast.success("Borrador guardado. No se publica hasta pulsar Publicar aviso.");
  }

  function saveAll() {
    saveCheckinMessageSettings(settings);
    saveCompanyTickerSettings(tickerSettings);
    toast.success("Comunicados y marquesina guardados.");
  }

  const preview = selectedManual ?? templateToManual(settings.automatic.birthday, "Cumpleaños");

  function renderEmojiPicker(target: "manual" | "birthday" | "saint") {
    const current = target === "manual" ? (selectedManual?.style.icon || "") : target === "birthday" ? (settings.automatic.birthday.icon || settings.automatic.birthday.style.icon || "") : (settings.automatic.saint.icon || settings.automatic.saint.style.icon || "");
    const applyIcons = (next: string) => {
      if (target === "manual" && selectedManual) updateManualStyle(selectedManual.id, { icon: next });
      if (target === "birthday") updateAuto("birthday", { icon: next, style: { ...settings.automatic.birthday.style, icon: next } });
      if (target === "saint") updateAuto("saint", { icon: next, style: { ...settings.automatic.saint.style, icon: next } });
    };
    const toggleIcon = (emoji: string) => applyIcons(toggleIconString(current, emoji));
    return (
      <div className="rounded-2xl border border-sky-100 bg-white p-3">
        <div className="mb-3 rounded-2xl border border-sky-100 bg-sky-50/70 p-2">
          <div className="mb-1 text-[11px] font-black uppercase tracking-wide text-sky-900">Iconos seleccionados</div>
          {selectedIconPills(current, (emoji) => applyIcons(toggleIconString(current, emoji)))}
        </div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {EMOJI_CATEGORIES.map((cat) => (
            <button key={cat.name} type="button" onClick={() => setEmojiCategory(cat.name)} className={`rounded-full border px-2.5 py-1 text-[11px] font-black transition ${emojiCategory === cat.name ? "border-sky-300 bg-sky-100 text-sky-900" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
              {cat.name}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-8 gap-1.5 md:grid-cols-12">
          {currentEmojiList.map((emoji) => {
            const active = iconList(current).includes(emoji);
            return (
              <button key={emoji} type="button" onClick={() => toggleIcon(emoji)} className={`rounded-xl border px-2 py-2 text-xl transition ${active ? "border-sky-400 bg-sky-100 ring-2 ring-sky-100" : "border-slate-200 bg-slate-50 hover:border-sky-300 hover:bg-sky-50"}`} title={active ? "Quitar icono" : "Agregar icono"}>
                {emoji}
              </button>
            );
          })}
        </div>
        <div className="mt-2 text-[11px] font-medium text-slate-500">Puedes elegir varios iconos. Pulsa de nuevo sobre uno para quitarlo.</div>
      </div>
    );
  }

  function targetValueControl(message: ManualCheckinMessage) {
    if (message.targetMode === "employee") {
      return (
        <label className="text-xs font-black text-slate-600 md:col-span-2">
          Trabajador registrado
          <select className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={message.targetValue} onChange={(e) => updateManual(message.id, { targetValue: e.target.value })}>
            <option value="">Seleccionar trabajador…</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name} · {e.center || "Sin centro"} · {e.department || "Sin depto."}</option>)}
          </select>
          {selectedEmployee && <span className="mt-1 block text-[11px] font-medium text-slate-500">Se mostrará sólo a {selectedEmployee.full_name}.</span>}
        </label>
      );
    }
    if (message.targetMode === "center") {
      return (
        <label className="text-xs font-black text-slate-600 md:col-span-2">
          Centro registrado
          <select className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={message.targetValue} onChange={(e) => updateManual(message.id, { targetValue: e.target.value })}>
            <option value="">Seleccionar centro…</option>
            {centers.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      );
    }
    if (message.targetMode === "department") {
      return (
        <label className="text-xs font-black text-slate-600 md:col-span-2">
          Departamento registrado
          <select className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={message.targetValue} onChange={(e) => updateManual(message.id, { targetValue: e.target.value })}>
            <option value="">Seleccionar departamento…</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
      );
    }
    return (
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 md:col-span-2">
        Se mostrará a todos los trabajadores dentro del rango de fechas.
      </div>
    );
  }

  function tickerTargetValueControl(message: CompanyTickerMessage) {
    if (message.targetMode === "employee") {
      return (
        <label className="text-xs font-black text-slate-600 md:col-span-2">
          Trabajador registrado
          <select className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={message.targetValue} onChange={(e) => updateTicker(message.id, { targetValue: e.target.value })}>
            <option value="">Seleccionar trabajador…</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name} · {e.center || "Sin centro"} · {e.department || "Sin depto."}</option>)}
          </select>
        </label>
      );
    }
    if (message.targetMode === "center") {
      return (
        <label className="text-xs font-black text-slate-600 md:col-span-2">
          Centro registrado
          <select className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={message.targetValue} onChange={(e) => updateTicker(message.id, { targetValue: e.target.value })}>
            <option value="">Seleccionar centro…</option>
            {centers.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      );
    }
    if (message.targetMode === "department") {
      return (
        <label className="text-xs font-black text-slate-600 md:col-span-2">
          Departamento registrado
          <select className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={message.targetValue} onChange={(e) => updateTicker(message.id, { targetValue: e.target.value })}>
            <option value="">Seleccionar departamento…</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
      );
    }
    return <div className="rounded-2xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900 md:col-span-2">Se mostrará a todos dentro del rango de fechas.</div>;
  }

  return (
    <div className="space-y-5 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Vista al fichar</div>
          <h1 className="text-3xl font-black text-slate-950">Comunicados y felicitaciones</h1>
          <p className="max-w-3xl text-sm text-slate-500">
            Los mensajes manuales se asignan con combos: trabajador registrado, centro o departamento. No se escribe el nombre a mano.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={addManual} className="rounded-xl">Nuevo comunicado</Button>
          <Button onClick={saveAll} variant="outline" className="rounded-xl bg-white">Guardar</Button>
        </div>
      </div>

      <Card className="rounded-3xl border-sky-100 bg-white/90 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">0. Marquesina superior / comunicados RRHH</h2>
            <p className="text-xs text-slate-500">Comunicados oficiales en movimiento en la parte superior del fichaje. Edita en borrador, revisa el preview y publica cuando esté listo.</p>
          </div>
          <div className="flex gap-2">
            <label className="flex items-center gap-2 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-black text-sky-900"><input type="checkbox" checked={tickerSettings.enabled} onChange={(e) => persistTicker({ ...tickerSettings, enabled: e.target.checked })} /> Marquesina activa</label>
            <Button onClick={addTicker} variant="outline" className="rounded-xl bg-white">Nuevo aviso</Button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[270px_1fr]">
          <div className="space-y-2">
            {tickerSettings.messages.map((m) => (
              <button key={m.id} onClick={() => setSelectedTickerId(m.id)} className={`w-full rounded-2xl border p-3 text-left text-sm transition ${selectedTicker?.id === m.id ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                <div className="font-black">{m.icon} {m.title}</div>
                <div className="text-xs text-slate-500">{m.published ? "Publicado" : "Borrador"} · {m.targetMode === "all" ? "todos" : m.targetMode}</div>
              </button>
            ))}
          </div>
          {selectedTicker && (
            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">
                Estado: <b>{tickerStatusLabel(selectedTicker)}</b>. Puedes probar diseño, iconos y texto aquí abajo. Nadie lo verá hasta pulsar <b>Publicar aviso</b>.
              </div>

              <div className="grid gap-2 md:grid-cols-3">
                <label className="text-xs font-black text-slate-600">Iconos seleccionados<input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={selectedTicker.icon} onChange={(e) => updateTicker(selectedTicker.id, { icon: e.target.value })} />
                  <div className="mt-2">{selectedIconPills(selectedTicker.icon, (emoji) => updateTicker(selectedTicker.id, { icon: toggleIconString(selectedTicker.icon, emoji) }))}</div>
                </label>
                <label className="text-xs font-black text-slate-600 md:col-span-2">Título<input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={selectedTicker.title} onChange={(e) => updateTicker(selectedTicker.id, { title: e.target.value })} /></label>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Emojis rápidos para comunicados · puedes seleccionar varios</div>
                <div className="flex flex-wrap gap-1.5">
                  {EMOJI_CATEGORIES.find((c) => c.name === "Avisos")?.emojis.concat(["🎄", "🎅", "🏖️", "🕙", "🍽️", "🚌", "🚨", "📣", "🏢", "🧑‍💼"]).map((emoji) => (
                    <button key={emoji} type="button" onClick={() => updateTicker(selectedTicker.id, { icon: toggleIconString(selectedTicker.icon, emoji) })} className={`rounded-xl border px-2.5 py-2 text-xl transition ${iconList(selectedTicker.icon).includes(emoji) ? "border-sky-400 bg-sky-100 ring-2 ring-sky-100" : "border-slate-200 bg-slate-50 hover:border-sky-300 hover:bg-sky-50"}`}>{emoji}</button>
                  ))}
                </div>
              </div>

              <label className="text-xs font-black text-slate-600">Texto del comunicado<textarea className="mt-1 min-h-20 w-full rounded-xl border px-3 py-2 text-sm" value={selectedTicker.body} onChange={(e) => updateTicker(selectedTicker.id, { body: e.target.value })} /></label>

              <div className="rounded-2xl border border-sky-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-black text-slate-950">Preview privado</div>
                    <div className="text-xs text-slate-500">Así se verá antes de publicarlo. Este preview no aparece a los trabajadores.</div>
                  </div>
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-black text-sky-900">Vista previa</span>
                </div>
                <div className="overflow-hidden rounded-2xl border px-3 py-2" style={{ background: selectedTicker.background, borderColor: selectedTicker.border, color: selectedTicker.text, fontFamily: selectedTicker.fontFamily }}>
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl px-2 py-1 text-xs font-black text-white" style={{ background: selectedTicker.accent }}>Comunicado</div>
                    <div className="truncate text-sm font-semibold">{selectedTicker.icon} {selectedTicker.title}: {selectedTicker.body}</div>
                  </div>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-3">
                <label className="flex items-center gap-2 text-xs font-black text-slate-600"><input type="checkbox" checked={selectedTicker.enabled} onChange={(e) => updateTicker(selectedTicker.id, { enabled: e.target.checked })} /> Aviso habilitado</label>
                <label className="text-xs font-black text-slate-600">Velocidad<select className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={selectedTicker.speed} onChange={(e) => updateTicker(selectedTicker.id, { speed: e.target.value as any })}><option value="slow">Lenta</option><option value="normal">Normal</option><option value="fast">Rápida</option><option value="static">Fija sin movimiento</option></select></label>
                <label className="text-xs font-black text-slate-600">Fuente<select className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={selectedTicker.fontFamily} onChange={(e) => updateTicker(selectedTicker.id, { fontFamily: e.target.value })}>{FONT_OPTIONS.map((f) => <option key={f}>{f}</option>)}</select></label>
              </div>

              <div className="grid gap-2 md:grid-cols-3">
                <label className="text-xs font-black text-slate-600">Dirigido a<select className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={selectedTicker.targetMode} onChange={(e) => updateTicker(selectedTicker.id, { targetMode: e.target.value as any, targetValue: "" })}><option value="all">Todos</option><option value="employee">Trabajador registrado</option><option value="center">Centro registrado</option><option value="department">Departamento registrado</option></select></label>
                {tickerTargetValueControl(selectedTicker)}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="mb-2 text-sm font-black text-slate-950">Publicación</div>
                <div className="grid gap-2 md:grid-cols-3">
                  <label className="text-xs font-black text-slate-600">Duración<select className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={selectedTicker.publishMode} onChange={(e) => updateTicker(selectedTicker.id, { publishMode: e.target.value as any })}><option value="default24h">Por defecto: 24 horas</option><option value="custom">Desde / hasta fechas</option></select></label>
                  {selectedTicker.publishMode === "custom" ? (
                    <>
                      <label className="text-xs font-black text-slate-600">Desde<input type="date" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={selectedTicker.startDate} onChange={(e) => updateTicker(selectedTicker.id, { startDate: e.target.value })} /></label>
                      <label className="text-xs font-black text-slate-600">Hasta<input type="date" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={selectedTicker.endDate} onChange={(e) => updateTicker(selectedTicker.id, { endDate: e.target.value })} /></label>
                    </>
                  ) : (
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 md:col-span-2">
                      Al publicar, se mostrará durante 24 horas y luego desaparecerá automáticamente de la marquesina.
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-5">
                <label className="text-xs font-black text-slate-600">Fondo<input type="color" className="mt-1 h-10 w-full rounded-xl border" value={selectedTicker.background} onChange={(e) => updateTicker(selectedTicker.id, { background: e.target.value })} /></label>
                <label className="text-xs font-black text-slate-600">Borde<input type="color" className="mt-1 h-10 w-full rounded-xl border" value={selectedTicker.border} onChange={(e) => updateTicker(selectedTicker.id, { border: e.target.value })} /></label>
                <label className="text-xs font-black text-slate-600">Texto<input type="color" className="mt-1 h-10 w-full rounded-xl border" value={selectedTicker.text} onChange={(e) => updateTicker(selectedTicker.id, { text: e.target.value })} /></label>
                <label className="text-xs font-black text-slate-600">Etiqueta<input type="color" className="mt-1 h-10 w-full rounded-xl border" value={selectedTicker.accent} onChange={(e) => updateTicker(selectedTicker.id, { accent: e.target.value })} /></label>
                <label className="text-xs font-black text-slate-600">Paleta<select className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" defaultValue="" onChange={(e) => { const p = PALETTE_OPTIONS.find((p) => p.name === e.target.value); if (p) updateTicker(selectedTicker.id, { background: p.background, border: p.border, text: p.text, accent: p.accent }); }}><option value="">Aplicar…</option>{PALETTE_OPTIONS.map((p) => <option key={p.name}>{p.name}</option>)}</select></label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button variant="outline" className="rounded-xl bg-white" onClick={() => deleteTicker(selectedTicker.id)}>Eliminar aviso</Button>
                <div className="flex flex-wrap gap-2">
                  {selectedTicker.published && <Button variant="outline" className="rounded-xl bg-white text-rose-700" onClick={() => unpublishTicker(selectedTicker)}>Retirar publicación</Button>}
                  <Button variant="outline" className="rounded-xl bg-white" onClick={saveTickerDraft}>Guardar borrador</Button>
                  <Button className="rounded-xl bg-emerald-600 hover:bg-emerald-700" onClick={() => publishTicker(selectedTicker)}>Publicar aviso</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_.9fr]">
        <div className="space-y-4">
          <Card className="rounded-3xl border-slate-200 bg-white/85 p-4 shadow-sm">
            <h2 className="text-lg font-black">1. Plantillas automáticas</h2>
            <p className="mb-4 text-xs text-slate-500">Cumpleaños y santos se activan solos. Aquí editas icono, texto y colores.</p>
            <div className="grid gap-3 lg:grid-cols-2">
              {(["birthday", "saint"] as const).map((kind) => {
                const t = settings.automatic[kind];
                return (
                  <div key={kind} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="font-black">{kind === "birthday" ? "Cumpleaños automático" : "Santo automático"}</div>
                      <label className="flex items-center gap-2 text-xs font-black text-slate-600">
                        <input type="checkbox" checked={t.enabled} onChange={(e) => updateAuto(kind, { enabled: e.target.checked })} /> Activo
                      </label>
                    </div>
                    <div className="grid gap-2">
                      <label className="text-xs font-black text-slate-600">Iconos actuales<input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={t.icon} onChange={(e) => updateAuto(kind, { icon: e.target.value, style: { ...t.style, icon: e.target.value } })} /></label>
                      {renderEmojiPicker(kind)}
                      <label className="text-xs font-black text-slate-600">Título<input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={t.title} onChange={(e) => updateAuto(kind, { title: e.target.value })} /></label>
                      <label className="text-xs font-black text-slate-600">Texto<textarea className="mt-1 min-h-20 w-full rounded-xl border px-3 py-2 text-sm" value={t.body} onChange={(e) => updateAuto(kind, { body: e.target.value })} /></label>
                      <div className="flex flex-wrap gap-1.5">
                        {VARIABLE_TOKENS.map((token) => <button key={token} type="button" onClick={() => updateAuto(kind, { body: insertToken(t.body, token) })} className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-black text-sky-800">Insertar {token}</button>)}
                      </div>
                      <select className="rounded-xl border px-3 py-2 text-sm" onChange={(e) => updateAuto(kind, { style: applyPaletteToStyle(t.style, e.target.value) })} defaultValue="">
                        <option value="">Aplicar paleta…</option>
                        {PALETTE_OPTIONS.map((p) => <option key={p.name}>{p.name}</option>)}
                      </select>
                      <div className="grid gap-2 md:grid-cols-3">
                        <label className="text-xs font-black text-slate-600">Fondo<input type="color" className="mt-1 h-10 w-full rounded-xl border" value={t.style.background} onChange={(e) => updateAutoStyle(kind, { background: e.target.value })} /></label>
                        <label className="text-xs font-black text-slate-600">Borde<input type="color" className="mt-1 h-10 w-full rounded-xl border" value={t.style.border} onChange={(e) => updateAutoStyle(kind, { border: e.target.value })} /></label>
                        <label className="text-xs font-black text-slate-600">Texto<input type="color" className="mt-1 h-10 w-full rounded-xl border" value={t.style.text} onChange={(e) => updateAutoStyle(kind, { text: e.target.value })} /></label>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="rounded-3xl border-slate-200 bg-white/85 p-4 shadow-sm">
            <h2 className="text-lg font-black">2. Comunicados manuales</h2>
            <p className="mb-4 text-xs text-slate-500">Ascensos, responsabilidades, reconocimientos, cumpleaños manuales, viajes, despedidas o condolencias.</p>
            <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
              <div className="space-y-2">
                {settings.manual.map((m) => (
                  <button key={m.id} onClick={() => setSelectedManualId(m.id)} className={`w-full rounded-2xl border p-3 text-left text-sm transition ${selectedManual?.id === m.id ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                    <div className="font-black">{m.style.icon} {m.name}</div>
                    <div className="text-xs text-slate-500">{m.enabled ? "Activo" : "Inactivo"} · {m.subjectName ? `para ${m.subjectName}` : (m.targetMode === "employee" ? "trabajador" : m.targetMode)}</div>
                  </button>
                ))}
              </div>

              {selectedManual && (
                <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="grid gap-2 md:grid-cols-2">
                    <label className="text-xs font-black text-slate-600">Nombre interno<input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={selectedManual.name} onChange={(e) => updateManual(selectedManual.id, { name: e.target.value })} /></label>
                    <label className="text-xs font-black text-slate-600">Tipo<select className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={selectedManual.type} onChange={(e) => {
                      const selected = TYPE_OPTIONS.find((t) => t.value === e.target.value);
                      const tpl = manualTemplateForType(e.target.value, selected?.icon || selectedManual.style.icon || "🎉");
                      updateManual(selectedManual.id, { type: e.target.value as any, title: tpl.title, body: tpl.body } as any);
                      if (selected) updateManualStyle(selectedManual.id, { icon: selected.icon });
                    }}>{TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}</select></label>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-black text-slate-600"><input type="checkbox" checked={selectedManual.enabled} onChange={(e) => updateManual(selectedManual.id, { enabled: e.target.checked })} /> Mostrar al fichar</label>
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
                    <div className="mb-2 text-xs font-black uppercase tracking-wide text-amber-900">Persona protagonista del comunicado</div>
                    <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                      <label className="text-xs font-black text-slate-600">Empleado registrado
                        <select className="mt-1 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm" value={selectedManual.subjectEmployeeId || ""} onChange={(e) => updateManualSubject(selectedManual.id, e.target.value)}>
                          <option value="">Seleccionar empleado protagonista…</option>
                          {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name} · {e.center || "Sin centro"} · {e.department || "Sin depto."}</option>)}
                        </select>
                      </label>
                      <Button type="button" variant="outline" className="self-end rounded-xl bg-white" onClick={() => applyManualTemplate(selectedManual)}>Usar plantilla con nombre</Button>
                    </div>
                    <p className="mt-2 text-[11px] font-medium text-amber-900">
                      Este nombre reemplaza {"{nombre}"} y {"{nombre_completo}"}. Si el comunicado es para todos, todos verán el nombre de esta persona. Si además eliges Dirigido a → Trabajador registrado, sólo esa persona lo verá al fichar.
                    </p>
                  </div>
                  <div className="grid gap-2 md:grid-cols-3">
                    <label className="text-xs font-black text-slate-600">Dirigido a<select className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={selectedManual.targetMode} onChange={(e) => updateManual(selectedManual.id, { targetMode: e.target.value as any, targetValue: "" })}><option value="all">Todos</option><option value="employee">Trabajador registrado</option><option value="center">Centro registrado</option><option value="department">Departamento registrado</option></select></label>
                    {targetValueControl(selectedManual)}
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <label className="text-xs font-black text-slate-600">Desde<input type="date" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={selectedManual.startDate} onChange={(e) => updateManual(selectedManual.id, { startDate: e.target.value })} /></label>
                    <label className="text-xs font-black text-slate-600">Hasta<input type="date" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={selectedManual.endDate} onChange={(e) => updateManual(selectedManual.id, { endDate: e.target.value })} /></label>
                  </div>
                  <label className="text-xs font-black text-slate-600">Título<input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={selectedManual.title} onChange={(e) => updateManual(selectedManual.id, { title: e.target.value })} /></label>
                  <label className="text-xs font-black text-slate-600">Texto<textarea className="mt-1 min-h-24 w-full rounded-xl border px-3 py-2 text-sm" value={selectedManual.body} onChange={(e) => updateManual(selectedManual.id, { body: e.target.value })} /></label>
                  <div className="flex flex-wrap gap-1.5">
                    {VARIABLE_TOKENS.map((token) => <button key={token} type="button" onClick={() => updateManual(selectedManual.id, { body: insertToken(selectedManual.body, token) })} className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-black text-sky-800">Insertar {token}</button>)}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Biblioteca de emojis</div>
                    {renderEmojiPicker("manual")}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Editor visual</div>
                    <div className="grid gap-2 md:grid-cols-4">
                      <label className="text-xs font-black text-slate-600">Iconos actuales<input className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={selectedManual.style.icon} onChange={(e) => updateManualStyle(selectedManual.id, { icon: e.target.value })} /></label>
                      <label className="text-xs font-black text-slate-600">Fuente<select className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={selectedManual.style.fontFamily} onChange={(e) => updateManualStyle(selectedManual.id, { fontFamily: e.target.value })}>{FONT_OPTIONS.map((f) => <option key={f}>{f}</option>)}</select></label>
                      <label className="text-xs font-black text-slate-600">Fondo<input type="color" className="mt-1 h-10 w-full rounded-xl border" value={selectedManual.style.background} onChange={(e) => updateManualStyle(selectedManual.id, { background: e.target.value })} /></label>
                      <label className="text-xs font-black text-slate-600">Texto<input type="color" className="mt-1 h-10 w-full rounded-xl border" value={selectedManual.style.text} onChange={(e) => updateManualStyle(selectedManual.id, { text: e.target.value })} /></label>
                      <label className="text-xs font-black text-slate-600">Borde<input type="color" className="mt-1 h-10 w-full rounded-xl border" value={selectedManual.style.border} onChange={(e) => updateManualStyle(selectedManual.id, { border: e.target.value })} /></label>
                      <label className="text-xs font-black text-slate-600">Paleta<select className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" onChange={(e) => updateManualStyle(selectedManual.id, applyPaletteToStyle(selectedManual.style, e.target.value))} defaultValue=""><option value="">Aplicar…</option>{PALETTE_OPTIONS.map((p) => <option key={p.name}>{p.name}</option>)}</select></label>
                      <label className="flex items-end gap-2 text-xs font-black text-slate-600"><input type="checkbox" checked={selectedManual.style.bold} onChange={(e) => updateManualStyle(selectedManual.id, { bold: e.target.checked })} /> Negrita</label>
                      <label className="flex items-end gap-2 text-xs font-black text-slate-600"><input type="checkbox" checked={selectedManual.style.italic} onChange={(e) => updateManualStyle(selectedManual.id, { italic: e.target.checked })} /> Cursiva</label>
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <Button variant="outline" className="rounded-xl bg-white" onClick={() => deleteManual(selectedManual.id)}>Eliminar</Button>
                    <Button className="rounded-xl" onClick={saveAll}>Guardar cambios</Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="rounded-3xl border-slate-200 bg-white/85 p-4 shadow-sm">
            <h2 className="text-lg font-black">Vista previa al fichar</h2>
            <p className="mb-4 text-xs text-slate-500">Así se verá la tarjeta antes de iniciar jornada.</p>
            <div className="rounded-[1.6rem] border p-6 text-center" style={{ background: preview.style.background, borderColor: preview.style.border, color: preview.style.text, fontFamily: preview.style.fontFamily, textAlign: preview.style.align as any }}>
              <div className="text-5xl">{preview.style.icon}</div>
              <h3 className="mt-3" style={{ fontSize: preview.style.titleSize, fontWeight: preview.style.bold ? 900 : 700, fontStyle: preview.style.italic ? "italic" : "normal" }}>{previewTokens(preview.title, previewSubjectName)}</h3>
              <p className="mx-auto mt-2 max-w-md leading-relaxed" style={{ fontSize: preview.style.bodySize }}>{previewTokens(preview.body, previewSubjectName)}</p>
            </div>
          </Card>

          <Card className="rounded-3xl border-sky-100 bg-sky-50/70 p-4 text-sm text-slate-700 shadow-sm">
            <h3 className="font-black text-slate-900">Cómo funciona</h3>
            <p className="mt-2">Los automáticos se activan por cumpleaños/santo. Los manuales se asignan con combos: trabajador registrado, centro, departamento o todos.</p>
            <p className="mt-2">El nombre no se escribe a mano. Para trabajador se elige desde el listado registrado.</p>
            <p className="mt-2">La marquesina superior sirve para avisos oficiales de RRHH: horarios especiales, días libres, cambios de entrada/salida o comunicados urgentes.<br />Variables disponibles en tarjetas: <b>{"{nombre}"}</b> y <b>{"{nombre_completo}"}</b>.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}


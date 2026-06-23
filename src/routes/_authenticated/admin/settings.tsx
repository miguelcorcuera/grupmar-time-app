import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Settings,
  Save,
  Palette,
  Check,
  RotateCcw,
  Monitor,
  Moon,
  Sun,
  SlidersHorizontal,
  Eye,
  Pipette,
  Plus,
  Trash2,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { VersionBadge } from "@/lib/grupmarAdminLocal";
import {
  applyTheme,
  getAllThemes,
  getSavedTheme,
  saveTheme,
  upsertCustomTheme,
  deleteCustomTheme,
  type GrupmarTheme,
  type ThemeId,
} from "@/lib/grupmarTheme";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({ meta: [{ title: "Configuración — GrupMar Time" }] }),
  component: SettingsPage,
});

type SettingsRow = {
  id: string;
  company_name: string;
  default_tolerance_minutes: number;
  exit_grace_minutes: number;
  require_lunch: boolean;
  require_location_check: boolean;
  monthly_report_mode: string;
  office_name?: string;
  office_public_ip?: string;
  office_latitude?: number;
  office_longitude?: number;
  office_altitude_meters?: number;
  office_radius_meters?: number;
  updated_at?: string;
};

const DEFAULT_SETTINGS: SettingsRow = {
  id: "local-settings",
  company_name: "GrupMar Time",
  default_tolerance_minutes: 10,
  exit_grace_minutes: 10,
  require_lunch: true,
  require_location_check: true,
  monthly_report_mode: "executive",
  office_name: "Son Oms",
  office_public_ip: "80.24.218.227",
  office_latitude: 39.542466,
  office_longitude: 2.741202,
  office_altitude_meters: 0,
  office_radius_meters: 160,
};

const THEME_FIELDS = [
  { key: "--gmt-bg", label: "Fondo general", help: "Color de fondo de toda la aplicación." },
  { key: "--gmt-card", label: "Tarjetas / paneles", help: "Fondo de cajas, paneles y tarjetas." },
  { key: "--gmt-ink", label: "Texto principal", help: "Títulos, nombres y textos principales." },
  { key: "--gmt-muted", label: "Texto secundario", help: "Subtítulos, ayudas y textos suaves." },
  { key: "--gmt-line", label: "Bordes", help: "Líneas de cajas, inputs, tablas y separadores." },
  { key: "--gmt-sidebar", label: "Menú lateral", help: "Fondo del menú lateral." },
  { key: "--gmt-logo-bg", label: "Fondo del logotipo", help: "Fondo exclusivo detrás del logo. Usa transparent para que tome el fondo del menú." },
  { key: "--gmt-sidebar-active", label: "Menú activo", help: "Elemento seleccionado del menú." },
  { key: "--gmt-sidebar-active-ink", label: "Texto menú activo", help: "Letra del elemento seleccionado." },
  { key: "--gmt-topbar", label: "Barra superior", help: "Fondo de la cabecera superior." },
  { key: "--gmt-action-bg", label: "Botones principales", help: "Color de Guardar, Nuevo, pestaña activa y botones principales." },
  { key: "--gmt-action-ink", label: "Texto botones", help: "Letra dentro de botones principales." },
  { key: "--gmt-blue-soft", label: "Fondo suave", help: "Badges, fondos suaves y resaltados neutros." },
  { key: "--gmt-danger", label: "Error / peligro", help: "Alertas rojas, bloqueos y errores." },
  { key: "--gmt-success", label: "Correcto / éxito", help: "Estados correctos, validaciones y confirmaciones." },
  { key: "--gmt-warning", label: "Advertencia", help: "Avisos, incidencias y pendientes." },
] as const;

function normalizeColorValue(value: string) {
  const v = String(value ?? "").trim();
  if (v.startsWith("#")) return v.slice(0, 7);
  if (v.startsWith("rgb")) return "#ffffff";
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : "#ffffff";
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "tema-personalizado";
}

function SettingsPage() {
  const [row, setRow] = useState<SettingsRow | null>(null);
  const [source, setSource] = useState("local editable");
  const [themes, setThemes] = useState<GrupmarTheme[]>(() => getAllThemes());
  const [savedThemeId, setSavedThemeId] = useState<ThemeId>(() => getSavedTheme().id);
  const [previewThemeId, setPreviewThemeId] = useState<ThemeId>(() => getSavedTheme().id);
  const [editorName, setEditorName] = useState("");
  const [editorDescription, setEditorDescription] = useState("");
  const [editorVars, setEditorVars] = useState<Record<string, string>>({});

  const previewTheme = useMemo(() => themes.find((item) => item.id === previewThemeId) ?? themes[0], [themes, previewThemeId]);
  const savedTheme = useMemo(() => themes.find((item) => item.id === savedThemeId) ?? themes[0], [themes, savedThemeId]);

  async function load() {
    const { data, error } = await (supabase as any)
      .from("time_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      setRow(data as SettingsRow);
      setSource("Supabase/time_settings");
      return;
    }

    setRow(DEFAULT_SETTINGS);
    setSource("Valores por defecto; pendiente de guardar en Supabase");
  }

  useEffect(() => {
    load();
    const all = getAllThemes();
    const current = getSavedTheme();
    setThemes(all);
    setSavedThemeId(current.id);
    setPreviewThemeId(current.id);
    setEditorName(current.custom ? current.name : `${current.name} personalizado`);
    setEditorDescription(current.description);
    setEditorVars({ ...current.vars });
    applyTheme(current.id);
  }, []);

  function selectTheme(theme: GrupmarTheme) {
    setPreviewThemeId(theme.id);
    setEditorName(theme.custom ? theme.name : `${theme.name} personalizado`);
    setEditorDescription(theme.description);
    setEditorVars({ ...theme.vars });
    applyTheme(theme.id);
    toast.info(`Preview aplicado: ${theme.name}`);
  }

  function previewEditor(vars = editorVars) {
    setPreviewThemeId(previewTheme.id);
    applyTheme(previewTheme.id, { vars });
    toast.info("Preview del editor aplicado.");
  }

  function updateEditorVar(key: string, value: string) {
    const next = { ...editorVars, [key]: value };
    setEditorVars(next);
    applyTheme(previewTheme.id, { vars: next });
  }

  function saveThemeNow() {
    const theme = saveTheme(previewThemeId);
    setSavedThemeId(theme.id);
    toast.success(`Tema guardado: ${theme.name}`);
  }

  function restoreSavedTheme() {
    const current = getSavedTheme();
    setThemes(getAllThemes());
    setSavedThemeId(current.id);
    setPreviewThemeId(current.id);
    setEditorName(current.custom ? current.name : `${current.name} personalizado`);
    setEditorDescription(current.description);
    setEditorVars({ ...current.vars });
    applyTheme(current.id);
    toast.info(`Preview restaurado: ${current.name}`);
  }

  function resetEditorToSelected() {
    setEditorName(previewTheme.custom ? previewTheme.name : `${previewTheme.name} personalizado`);
    setEditorDescription(previewTheme.description);
    setEditorVars({ ...previewTheme.vars });
    applyTheme(previewTheme.id);
    toast.info("Editor restaurado al tema seleccionado.");
  }

  function createCustomFromEditor() {
    const name = editorName.trim() || `${previewTheme.name} personalizado`;
    const id = previewTheme.custom ? previewTheme.id : `custom-${slugify(name)}-${Date.now().toString(36)}`;
    const custom = upsertCustomTheme({
      id,
      name,
      mode: "Personalizado",
      description: editorDescription.trim() || `Tema personalizado basado en ${previewTheme.name}`,
      basedOn: previewTheme.id,
      custom: true,
      preview: [
        editorVars["--gmt-bg"],
        editorVars["--gmt-card"],
        editorVars["--gmt-line"],
        editorVars["--gmt-action-bg"],
      ],
      vars: { ...editorVars },
    });

    const all = getAllThemes();
    setThemes(all);
    setPreviewThemeId(custom.id);
    setSavedThemeId(custom.id);
    applyTheme(custom.id, { persist: true });
    toast.success(previewTheme.custom ? "Tema personalizado actualizado." : "Tema personalizado creado y guardado.");
  }

  function cloneSelectedTheme() {
    const name = `${previewTheme.name} copia`;
    setEditorName(name);
    setEditorDescription(`Copia editable de ${previewTheme.name}`);
    setEditorVars({ ...previewTheme.vars });
    setPreviewThemeId(previewTheme.id);
    toast.info("Copia preparada. Ajusta colores y pulsa Crear/guardar personalizado.");
  }

  function removeCustomTheme(theme: GrupmarTheme) {
    if (!theme.custom) {
      toast.error("Los temas base no se eliminan. Crea uno personalizado y edítalo.");
      return;
    }
    if (!confirm(`Eliminar tema personalizado "${theme.name}"?`)) return;
    deleteCustomTheme(theme.id);
    const all = getAllThemes();
    const fallback = all[0];
    setThemes(all);
    setPreviewThemeId(fallback.id);
    setSavedThemeId(getSavedTheme().id);
    setEditorName(`${fallback.name} personalizado`);
    setEditorDescription(fallback.description);
    setEditorVars({ ...fallback.vars });
    applyTheme(fallback.id);
    toast.success("Tema personalizado eliminado.");
  }

  async function saveSettings() {
    if (!row) return;

    const payload = {
      ...row,
      id: row.id?.startsWith("local-") ? "global-settings" : row.id,
      updated_at: new Date().toISOString(),
    };

    const { error } = await (supabase as any).from("time_settings").upsert(payload);

    if (error) {
      console.error(error);
      toast.error("No se pudo guardar configuración en Supabase.");
      return;
    }

    setRow(payload);
    setSource("Supabase/time_settings");
    toast.success("Configuración guardada en Supabase");
  }

  function update<K extends keyof SettingsRow>(key: K, value: SettingsRow[K]) {
    setRow((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  if (!row) {
    return <div className="gmt-admin-content"><div className="gmt-panel">Cargando configuración…</div></div>;
  }

  return (
    <div className="gmt-admin-content space-y-6">
      <VersionBadge />
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="gmt-kicker">Configuración global</p>
          <h1 className="gmt-title text-3xl flex items-center gap-2"><Settings className="w-7 h-7" /> Configuración</h1>
          <p className="gmt-subtitle">Reglas, sede, apariencia y editor visual completo de GrupMar Time.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={restoreSavedTheme}><RotateCcw className="w-4 h-4 mr-2" /> Deshacer preview</Button>
          <Button onClick={saveThemeNow}><Palette className="w-4 h-4 mr-2" /> Guardar tema activo</Button>
          <Button onClick={saveSettings}><Save className="w-4 h-4 mr-2" /> Guardar configuración</Button>
        </div>
      </div>

      <Card className="gmt-panel p-5">
        <div className="flex flex-col gap-1 mb-5">
          <h2 className="text-xl font-bold flex items-center gap-2"><Palette className="w-5 h-5" /> Temas visuales</h2>
          <p className="gmt-subtitle">Selecciona cualquier tema para previsualizarlo. El editor de abajo modifica el tema seleccionado y permite crear/guardar personalizados.</p>
          <p className="text-sm text-slate-500">Tema guardado: <b>{savedTheme?.name}</b>. Preview activo: <b>{previewTheme?.name}</b>.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {themes.map((theme) => {
            const Icon = theme.mode === "Oscuro" ? Moon : theme.mode === "Claro" ? Sun : Monitor;
            const active = previewThemeId === theme.id;
            const saved = savedThemeId === theme.id;
            return (
              <div
                key={theme.id}
                className={`text-left rounded-3xl border p-4 transition-all ${active ? "ring-2 ring-offset-2" : ""}`}
                style={{
                  background: theme.vars["--gmt-card"],
                  color: theme.vars["--gmt-ink"],
                  borderColor: active ? theme.vars["--gmt-action-bg"] : theme.vars["--gmt-line"],
                  boxShadow: active ? theme.vars["--gmt-shadow"] : theme.vars["--gmt-shadow-sm"],
                }}
              >
                <button type="button" onClick={() => selectTheme(theme)} className="w-full text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-2xl border p-2" style={{ background: theme.vars["--gmt-blue-soft"], borderColor: theme.vars["--gmt-line"] }}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <div>
                        <div className="font-bold">{theme.name}</div>
                        <div className="text-xs opacity-80">{theme.custom ? "Personalizado" : theme.mode}</div>
                      </div>
                    </div>
                    {saved && <span className="text-xs rounded-full px-2 py-1" style={{ background: theme.vars["--gmt-blue-soft"] }}><Check className="w-3 h-3 inline" /> Guardado</span>}
                  </div>
                  <p className="text-sm mt-3 opacity-85 min-h-[42px]">{theme.description}</p>
                  <div className="flex gap-2 mt-3">
                    {theme.preview.map((color) => <span key={color} className="h-8 flex-1 rounded-xl border" style={{ background: color, borderColor: theme.vars["--gmt-line"] }} />)}
                  </div>
                </button>

                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { selectTheme(theme); cloneSelectedTheme(); }}>
                    <Copy className="w-3 h-3 mr-1" /> Copiar
                  </Button>
                  {theme.custom && (
                    <Button size="sm" variant="outline" className="text-rose-600" onClick={() => removeCustomTheme(theme)}>
                      <Trash2 className="w-3 h-3 mr-1" /> Eliminar
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="gmt-panel p-5">
        <div className="flex flex-col gap-1 mb-5">
          <h2 className="text-xl font-bold flex items-center gap-2"><SlidersHorizontal className="w-5 h-5" /> Editor de tema seleccionado</h2>
          <p className="gmt-subtitle">Edita cualquier tema seleccionado. Los temas base se guardan como personalizados; los personalizados sí se actualizan.</p>
        </div>

        <div className="mb-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Nombre del tema personalizado</Label>
            <Input value={editorName} onChange={(event) => setEditorName(event.target.value)} />
          </div>
          <div>
            <Label>Descripción</Label>
            <Input value={editorDescription} onChange={(event) => setEditorDescription(event.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {THEME_FIELDS.map((field) => {
              const rawValue = editorVars[field.key] ?? "";
              const colorValue = normalizeColorValue(rawValue);
              return (
                <div key={field.key} className="rounded-2xl border p-3">
                  <Label className="font-bold">{field.label}</Label>
                  <p className="text-xs text-slate-500 mb-2">{field.help}</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="h-10 w-12 rounded-xl border bg-transparent p-1"
                      value={colorValue}
                      onChange={(event) => updateEditorVar(field.key, event.target.value)}
                    />
                    <Input value={rawValue} onChange={(event) => updateEditorVar(field.key, event.target.value)} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-3xl border p-4" style={{ background: editorVars["--gmt-card"], borderColor: editorVars["--gmt-line"], color: editorVars["--gmt-ink"] }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: editorVars["--gmt-muted"] }}>Preview</p>
                <h3 className="text-xl font-black">Panel ejemplo</h3>
              </div>
              <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: editorVars["--gmt-blue-soft"], color: editorVars["--gmt-ink"] }}>Activo</span>
            </div>
            <p className="mt-3 text-sm" style={{ color: editorVars["--gmt-muted"] }}>Así se verán tarjetas, textos, bordes y botones principales.</p>
            <div className="mt-4 grid gap-2">
              <button className="rounded-2xl border px-4 py-3 text-sm font-bold" style={{ background: editorVars["--gmt-action-bg"], color: editorVars["--gmt-action-ink"], borderColor: editorVars["--gmt-line"] }}>
                Botón principal
              </button>
              <div className="rounded-2xl border p-3" style={{ borderColor: editorVars["--gmt-line"], background: editorVars["--gmt-bg"] }}>
                <Pipette className="inline w-4 h-4 mr-2" /> Fondo y bordes
              </div>
              <div className="rounded-2xl border p-3" style={{ borderColor: editorVars["--gmt-warning"], background: "#fff7ed", color: editorVars["--gmt-warning"] }}>
                Avisos conservan color funcional
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={resetEditorToSelected}><RotateCcw className="w-4 h-4 mr-2" /> Restaurar seleccionado</Button>
          <Button variant="outline" onClick={() => previewEditor()}><Eye className="w-4 h-4 mr-2" /> Preview</Button>
          <Button onClick={createCustomFromEditor}><Plus className="w-4 h-4 mr-2" /> Crear/guardar personalizado</Button>
        </div>
      </Card>

      <Card className="gmt-panel p-5">
        <div className="flex flex-col gap-1 mb-5">
          <h2 className="text-xl font-bold">Reglas generales</h2>
          <p className="gmt-subtitle">Fuente actual: {source}. Estos valores controlan tolerancia, salida, almuerzo y validación de sede.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <div>
            <Label>Nombre empresa / sistema</Label>
            <Input value={row.company_name ?? ""} onChange={(event) => update("company_name", event.target.value)} />
          </div>
          <div>
            <Label>Tolerancia entrada (min)</Label>
            <Input type="number" value={row.default_tolerance_minutes} onChange={(event) => update("default_tolerance_minutes", Number(event.target.value))} />
          </div>
          <div>
            <Label>Margen salida (min)</Label>
            <Input type="number" value={row.exit_grace_minutes} onChange={(event) => update("exit_grace_minutes", Number(event.target.value))} />
          </div>
          <label className="flex items-center gap-3 rounded-2xl border p-3">
            <input type="checkbox" checked={!!row.require_lunch} onChange={(event) => update("require_lunch", event.target.checked)} />
            <span>Requerir almuerzo</span>
          </label>
          <label className="flex items-center gap-3 rounded-2xl border p-3">
            <input type="checkbox" checked={!!row.require_location_check} onChange={(event) => update("require_location_check", event.target.checked)} />
            <span>Validar ubicación / red</span>
          </label>
          <div>
            <Label>Modo informe mensual</Label>
            <Input value={row.monthly_report_mode ?? "executive"} onChange={(event) => update("monthly_report_mode", event.target.value)} />
          </div>
        </div>
      </Card>

      <Card className="gmt-panel p-5">
        <div className="flex flex-col gap-1 mb-5">
          <h2 className="text-xl font-bold">Sede principal / Geo-IP</h2>
          <p className="gmt-subtitle">Coordenadas, IP pública y radio para validar fichajes desde oficina.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <div>
            <Label>Nombre sede</Label>
            <Input value={row.office_name ?? ""} onChange={(event) => update("office_name", event.target.value)} />
          </div>
          <div>
            <Label>IP pública oficina</Label>
            <Input value={row.office_public_ip ?? ""} onChange={(event) => update("office_public_ip", event.target.value)} />
          </div>
          <div>
            <Label>Radio permitido (m)</Label>
            <Input type="number" value={row.office_radius_meters ?? 0} onChange={(event) => update("office_radius_meters", Number(event.target.value))} />
          </div>
          <div>
            <Label>Latitud</Label>
            <Input type="number" value={row.office_latitude ?? 0} onChange={(event) => update("office_latitude", Number(event.target.value))} />
          </div>
          <div>
            <Label>Longitud</Label>
            <Input type="number" value={row.office_longitude ?? 0} onChange={(event) => update("office_longitude", Number(event.target.value))} />
          </div>
          <div>
            <Label>Altitud aprox. (m)</Label>
            <Input type="number" value={row.office_altitude_meters ?? 0} onChange={(event) => update("office_altitude_meters", Number(event.target.value))} />
          </div>
        </div>
      </Card>
    </div>
  );
}


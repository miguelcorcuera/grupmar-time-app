import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Eye,
  EyeOff,
  FileDown,
  FileUp,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { EditableUiText } from "@/components/EditableUiText";
import { formatDateDDMMYYYY, toInputDate } from "@/lib/grupmarDate";
import { useUserTableSettings } from "@/lib/userTableSettings";
import { CelebrationsPage } from "@/components/admin/CelebrationsPanel";

export const Route = createFileRoute("/_authenticated/admin/access-maintenance")({
  component: AccessMaintenancePage,
});

type CatalogKey =
  | "personal"
  | "companies"
  | "departments"
  | "work_centers"
  | "document_types"
  | "job_positions"
  | "access_role_catalog"
  | "celebrations"
  | "shifts";

type AnyRow = Record<string, any>;

type ColumnDef = {
  key: string;
  label: string;
  type?: "text" | "date" | "status";
};

const CATALOGS: Array<{ key: CatalogKey; label: string; description: string; table: string; group: string }> = [
  { key: "personal", label: "Personal", description: "Trabajadores, accesos, rol, centro, cumpleaños y datos laborales", table: "profiles", group: "Personas" },
  { key: "shifts", label: "Turnos / Horarios", description: "Horarios configurados y turnos. Mantiene colores actuales del planificador.", table: "shifts", group: "Planificación" },
  { key: "companies", label: "Empresas", description: "Compañías o razones sociales", table: "companies", group: "Estructura" },
  { key: "departments", label: "Áreas", description: "Áreas/departamentos internos", table: "departments", group: "Estructura" },
  { key: "work_centers", label: "Centros", description: "Sedes o centros de trabajo", table: "work_centers", group: "Estructura" },
  { key: "job_positions", label: "Puestos", description: "Puestos laborales", table: "job_positions", group: "Estructura" },
  { key: "document_types", label: "Documentos", description: "Tipos de documento", table: "document_types", group: "Catálogos" },
  { key: "access_role_catalog", label: "Roles", description: "Roles disponibles para accesos", table: "access_role_catalog", group: "Catálogos" },
  { key: "celebrations", label: "Celebraciones", description: "Festivos, feriados y santoral. Cumpleaños se editan desde Personal.", table: "company_holidays", group: "Catálogos" },
];

const PERSONAL_COLUMNS: ColumnDef[] = [
  { key: "employee_code", label: "Código" },
  { key: "full_name", label: "Personal" },
  { key: "email", label: "Email" },
  { key: "role", label: "Rol" },
  { key: "company_name", label: "Empresa" },
  { key: "department", label: "Área" },
  { key: "work_center", label: "Centro" },
  { key: "job_position", label: "Puesto" },
  { key: "document_type", label: "Tipo doc." },
  { key: "document_number", label: "Documento" },
  { key: "birth_date", label: "Nacimiento", type: "date" },
  { key: "phone", label: "Teléfono" },
  { key: "active", label: "Estado", type: "status" },
];

const ROLE_COLUMNS: ColumnDef[] = [
  { key: "role", label: "Rol técnico" },
  { key: "label", label: "Nombre visible" },
  { key: "description", label: "Descripción" },
  { key: "sort_order", label: "Orden" },
  { key: "active", label: "Estado", type: "status" },
  { key: "created_at", label: "Creado", type: "date" },
  { key: "updated_at", label: "Actualizado", type: "date" },
];

const DOCUMENT_COLUMNS: ColumnDef[] = [
  { key: "code", label: "Código" },
  { key: "name", label: "Nombre" },
  { key: "description", label: "Descripción" },
  { key: "sort_order", label: "Orden" },
  { key: "active", label: "Estado", type: "status" },
  { key: "created_at", label: "Creado", type: "date" },
  { key: "updated_at", label: "Actualizado", type: "date" },
];

const GENERIC_COLUMNS: ColumnDef[] = [
  { key: "code", label: "Código" },
  { key: "name", label: "Nombre" },
  { key: "description", label: "Descripción" },
  { key: "active", label: "Estado", type: "status" },
  { key: "created_at", label: "Creado", type: "date" },
  { key: "updated_at", label: "Actualizado", type: "date" },
];

const COMPANY_COLUMNS: ColumnDef[] = [
  { key: "name", label: "Empresa" },
  { key: "legal_name", label: "Razón social" },
  { key: "tax_id", label: "CIF/NIF" },
  { key: "active", label: "Estado", type: "status" },
  { key: "created_at", label: "Creado", type: "date" },
  { key: "updated_at", label: "Actualizado", type: "date" },
];

const CENTER_COLUMNS: ColumnDef[] = [
  { key: "code", label: "Código" },
  { key: "name", label: "Centro" },
  { key: "address", label: "Dirección" },
  { key: "allowed_radius_meters", label: "Radio" },
  { key: "active", label: "Estado", type: "status" },
  { key: "created_at", label: "Creado", type: "date" },
  { key: "updated_at", label: "Actualizado", type: "date" },
];

const SHIFT_COLUMNS: ColumnDef[] = [
  { key: "name", label: "Turno" },
  { key: "description", label: "Descripción" },
  { key: "start_time", label: "Inicio" },
  { key: "end_time", label: "Fin" },
  { key: "lunch_start", label: "Almuerzo inicio" },
  { key: "lunch_end", label: "Almuerzo fin" },
  { key: "lunch_minutes", label: "Min. almuerzo" },
  { key: "entry_tolerance_minutes", label: "Tolerancia" },
  { key: "exit_grace_minutes", label: "Gracia salida" },
  { key: "weekly_hours", label: "Horas semana" },
  { key: "color", label: "Color" },
  { key: "active", label: "Estado", type: "status" },
];

const EMPTY_PERSONAL = {
  id: "",
  user_id: "",
  employee_code: "",
  full_name: "",
  email: "",
  role: "employee",
  company_name: "Grupo Marport",
  department: "",
  work_center: "",
  job_position: "",
  document_type: "DNI",
  document_number: "",
  birth_date: "",
  phone: "",
  active: true,
};

function getColumns(catalog: CatalogKey) {
  if (catalog === "personal") return PERSONAL_COLUMNS;
  if (catalog === "access_role_catalog") return ROLE_COLUMNS;
  if (catalog === "document_types") return DOCUMENT_COLUMNS;
  if (catalog === "companies") return COMPANY_COLUMNS;
  if (catalog === "work_centers") return CENTER_COLUMNS;
  if (catalog === "shifts") return SHIFT_COLUMNS;
  return GENERIC_COLUMNS;
}

function normalizeBool(value: any) {
  if (value === false) return false;
  if (String(value).toLowerCase() === "false") return false;
  if (String(value).toLowerCase() === "0") return false;
  return true;
}

function rowActive(row: AnyRow) {
  return normalizeBool(row.active ?? row.is_active ?? row.enabled);
}

function safeText(value: any) {
  return String(value ?? "").trim();
}

function renderCell(row: AnyRow, column: ColumnDef) {
  const value = row[column.key];

  if (column.type === "date") return formatDateDDMMYYYY(value);

  if (column.type === "status") {
    return (
      <span className={rowActive(row) ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700" : "rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500"}>
        {rowActive(row) ? "Activo" : "Inactivo"}
      </span>
    );
  }

  if (column.key === "full_name") {
    return (
      <div>
        <div className="font-black text-slate-950">{row.full_name || row.email || "—"}</div>
        <div className="text-xs text-slate-500">{row.email || "—"}</div>
      </div>
    );
  }

  if (column.key === "color") {
    return (
      <div className="flex items-center gap-2">
        <span className="h-4 w-4 rounded-full border border-slate-200" style={{ background: value || "#e5e7eb" }} />
        <span>{value || "—"}</span>
      </div>
    );
  }

  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function exportCsv(filename: string, rows: AnyRow[], columns: ColumnDef[]) {
  const keys = columns.map((x) => x.key);
  const csv = [
    keys.join(";"),
    ...rows.map((row) =>
      keys
        .map((key) => {
          const raw = key.includes("date") || key.endsWith("_at") ? formatDateDDMMYYYY(row[key]) : row[key] ?? "";
          return `"${String(raw).replace(/"/g, '""')}"`;
        })
        .join(";")
    ),
  ].join("\n");

  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function parseCsvLine(line: string) {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if ((char === ";" || char === ",") && !inQuotes) {
      out.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  out.push(current.trim());
  return out;
}

function parseCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: AnyRow = {};
    headers.forEach((header, index) => (row[header] = values[index] ?? ""));
    return row;
  });
}

async function callAdminUsers(payload: any) {
  const { data, error } = await (supabase as any).functions.invoke("admin-users", { body: payload });
  if (error) {
    let detail = error?.message || "Edge Function returned an error";
    try {
      const context = (error as any)?.context;
      if (context && typeof context.json === "function") {
        const body = await context.json();
        detail = body?.error || body?.message || body?.details || JSON.stringify(body);
      }
    } catch {
      // noop
    }
    throw new Error(`admin-users: ${detail}`);
  }
  if (data?.error) throw new Error(`admin-users: ${data.error}`);
  return data;
}

function AccessMaintenancePage() {
  const { toast } = useToast();

  const [catalog, setCatalog] = useState<CatalogKey>("personal");
  const [rows, setRows] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [query, setQuery] = useState("");

  const [companies, setCompanies] = useState<AnyRow[]>([]);
  const [departments, setDepartments] = useState<AnyRow[]>([]);
  const [centers, setCenters] = useState<AnyRow[]>([]);
  const [positions, setPositions] = useState<AnyRow[]>([]);
  const [documentTypes, setDocumentTypes] = useState<AnyRow[]>([]);
  const [roles, setRoles] = useState<AnyRow[]>([]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editor, setEditor] = useState<AnyRow>(EMPTY_PERSONAL);
  const [passwordMode, setPasswordMode] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [importText, setImportText] = useState("");

  const fileRef = useRef<HTMLInputElement | null>(null);

  const activeCatalog = CATALOGS.find((x) => x.key === catalog) || CATALOGS[0];
  const isPersonal = catalog === "personal";
  const isCompanies = catalog === "companies";
  const isRoles = catalog === "access_role_catalog";
  const isShifts = catalog === "shifts";
  const allColumns = getColumns(catalog);
  const tableKey = `maintenance.${catalog}`;
  const defaultColumnKeys = allColumns.map((x) => x.key);

  const { setting, save: saveTableSetting, orderedVisibleColumns, hiddenColumns } = useUserTableSettings(tableKey, defaultColumnKeys);

  const visibleColumns = useMemo(
    () => orderedVisibleColumns.map((key) => allColumns.find((c) => c.key === key)).filter(Boolean) as ColumnDef[],
    [orderedVisibleColumns, allColumns]
  );

  async function loadSupportCatalogs() {
    const read = async (table: string) => {
      const { data } = await (supabase as any).from(table).select("*").order("name", { ascending: true });
      return data || [];
    };

    const [c, d, w, p, dt] = await Promise.all([
      read("companies"),
      read("departments"),
      read("work_centers"),
      read("job_positions"),
      read("document_types"),
    ]);

    const { data: r } = await (supabase as any).from("access_role_catalog").select("*").order("sort_order", { ascending: true });

    setCompanies(c);
    setDepartments(d);
    setCenters(w);
    setPositions(p);
    setDocumentTypes(dt);
    setRoles(r || []);
  }

  async function loadRows() {
    setLoading(true);
    try {
      await loadSupportCatalogs();

      if (catalog === "personal") {
        const { data, error } = await (supabase as any).from("profiles").select("*").order("full_name", { ascending: true });
        if (error) throw error;
        setRows(data || []);
        return;
      }

      if (catalog === "access_role_catalog") {
        const { data, error } = await (supabase as any).from("access_role_catalog").select("*").order("sort_order", { ascending: true });
        if (error) throw error;
        setRows(data || []);
        return;
      }

      if (catalog === "shifts") {
        const { data, error } = await (supabase as any)
          .from("shift_templates")
          .select("*")
          .order("start_time", { ascending: true });
        if (error) throw error;
        setRows(data || []);
        return;
      }

      const { data, error } = await (supabase as any).from(activeCatalog.table).select("*").order("name", { ascending: true });
      if (error) throw error;
      setRows(data || []);
    } catch (error: any) {
      console.error(error);
      toast({ title: "Error cargando mantenimiento", description: error.message || String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();

    const base = rows.filter((row) => {
      if (!showInactive && !rowActive(row)) return false;
      if (!q) return true;
      return JSON.stringify(row).toLowerCase().includes(q);
    });

    if (!setting.sort_key) return base;

    return [...base].sort((a, b) => {
      const av = a[setting.sort_key || ""];
      const bv = b[setting.sort_key || ""];
      const aa = String(av ?? "").toLowerCase();
      const bb = String(bv ?? "").toLowerCase();
      const cmp = aa.localeCompare(bb, "es", { numeric: true });
      return setting.sort_dir === "desc" ? -cmp : cmp;
    });
  }, [rows, query, showInactive, setting.sort_key, setting.sort_dir]);

  async function persistTableSetting(next: typeof setting, successMessage?: string) {
    try {
      await saveTableSetting(next);
      if (successMessage) toast({ title: "Configuración guardada", description: successMessage });
    } catch (error: any) {
      console.error(error);
      toast({ title: "No se guardó la configuración", description: error.message || String(error), variant: "destructive" });
    }
  }

  async function showColumn(key: string) {
    const visible = [...setting.visible_columns, key].filter((value, index, arr) => arr.indexOf(value) === index);
    const order = setting.column_order.includes(key) ? setting.column_order : [...setting.column_order, key];
    await persistTableSetting({ ...setting, visible_columns: visible, column_order: order }, `Columna agregada: ${key}`);
  }

  async function hideColumn(key: string) {
    if (setting.visible_columns.length <= 1) {
      toast({ title: "Debe quedar al menos una columna visible", variant: "destructive" });
      return;
    }
    await persistTableSetting({ ...setting, visible_columns: setting.visible_columns.filter((x) => x !== key) }, `Columna oculta: ${key}`);
  }

  async function moveColumn(key: string, direction: -1 | 1) {
    const order = [...setting.column_order];
    const index = order.indexOf(key);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return;
    const [item] = order.splice(index, 1);
    order.splice(nextIndex, 0, item);
    await persistTableSetting({ ...setting, column_order: order }, "Orden de columnas guardado.");
  }

  async function replaceColumn(oldKey: string, newKey: string) {
    if (oldKey === newKey) return;
    const order = setting.column_order.map((key) => (key === oldKey ? newKey : key));
    const dedupedOrder = [...new Set(order)].filter((key) => defaultColumnKeys.includes(key));
    const withMissing = [...dedupedOrder, ...defaultColumnKeys.filter((key) => !dedupedOrder.includes(key))];
    const visible = setting.visible_columns
      .map((key) => (key === oldKey ? newKey : key))
      .filter((key, index, arr) => defaultColumnKeys.includes(key) && arr.indexOf(key) === index);

    await persistTableSetting({
      ...setting,
      column_order: withMissing,
      visible_columns: visible.includes(newKey) ? visible : [...visible, newKey],
      sort_key: setting.sort_key === oldKey ? newKey : setting.sort_key,
    }, "Campo de cabecera guardado.");
  }

  async function sortBy(key: string, dir?: "asc" | "desc") {
    const nextDir = dir || (setting.sort_key === key && setting.sort_dir === "asc" ? "desc" : "asc");
    await persistTableSetting({ ...setting, sort_key: key, sort_dir: nextDir }, `Orden ${nextDir.toUpperCase()} guardado.`);
  }

  function openNew() {
    if (isRoles) {
      setEditor({ id: "", role: "employee", label: "", description: "", sort_order: 999, active: true });
    } else if (isCompanies) {
      setEditor({ id: "", name: "", legal_name: "", tax_id: "", logo_storage_path: "", active: true });
    } else if (isShifts) {
      setEditor({
        id: "",
        name: "",
        description: "",
        start_time: "08:00",
        end_time: "17:00",
        lunch_start: "",
        lunch_end: "",
        lunch_minutes: 0,
        entry_tolerance_minutes: 10,
        exit_grace_minutes: 5,
        early_entry_minutes: 0,
        weekly_hours: "",
        color: "#2563eb",
        active: true,
      });
    } else {
      setEditor(isPersonal ? { ...EMPTY_PERSONAL } : { id: "", name: "", code: "", description: "", active: true });
    }
    setPasswordMode(false);
    setNewPassword("");
    setEditorOpen(true);
  }

  function openEdit(row: AnyRow) {
    if (isRoles) {
      setEditor({
        id: row.id || "",
        role: row.role || "employee",
        label: row.label || "",
        description: row.description || "",
        sort_order: row.sort_order ?? 999,
        active: rowActive(row),
      });
    } else if (isCompanies) {
      setEditor({
        id: row.id || "",
        name: row.name || "",
        legal_name: row.legal_name || row.name || "",
        tax_id: row.tax_id || "",
        logo_storage_path: row.logo_storage_path || "",
        active: rowActive(row),
      });
    } else if (isShifts) {
      setEditor({
        id: row.id || "",
        name: row.name || "",
        description: row.description || "",
        start_time: String(row.start_time || "08:00").slice(0, 5),
        end_time: String(row.end_time || "17:00").slice(0, 5),
        lunch_start: row.lunch_start ? String(row.lunch_start).slice(0, 5) : "",
        lunch_end: row.lunch_end ? String(row.lunch_end).slice(0, 5) : "",
        lunch_minutes: row.lunch_minutes ?? 0,
        entry_tolerance_minutes: row.entry_tolerance_minutes ?? 10,
        exit_grace_minutes: row.exit_grace_minutes ?? 5,
        early_entry_minutes: row.early_entry_minutes ?? 0,
        weekly_hours: row.weekly_hours ?? "",
        color: row.color || "#2563eb",
        active: rowActive(row),
      });
    } else {
      setEditor(isPersonal ? { ...EMPTY_PERSONAL, ...row, birth_date: toInputDate(row.birth_date), active: rowActive(row) } : { ...row, active: rowActive(row) });
    }
    setPasswordMode(false);
    setNewPassword("");
    setEditorOpen(true);
  }

  function openPassword(row: AnyRow) {
    setEditor({ ...EMPTY_PERSONAL, ...row, birth_date: toInputDate(row.birth_date), active: rowActive(row) });
    setPasswordMode(true);
    setNewPassword("");
    setEditorOpen(true);
  }

  async function savePersonal() {
    const payload = {
      profile_id: editor.id || null,
      user_id: editor.user_id || null,
      employee_code: safeText(editor.employee_code) || null,
      full_name: safeText(editor.full_name),
      email: safeText(editor.email).toLowerCase(),
      role: safeText(editor.role) || "employee",
      company_name: safeText(editor.company_name) || "Grupo Marport",
      department: safeText(editor.department) || null,
      work_center: safeText(editor.work_center) || null,
      job_position: safeText(editor.job_position) || null,
      document_type: safeText(editor.document_type) || null,
      document_number: safeText(editor.document_number) || null,
      birth_date: safeText(editor.birth_date) || null,
      phone: safeText(editor.phone) || null,
      active: normalizeBool(editor.active),
    };

    if (!payload.full_name || !payload.email) {
      toast({ title: "Faltan datos", description: "Nombre y email son obligatorios.", variant: "destructive" });
      return;
    }

    const { error } = await (supabase as any).rpc("admin_access_save_profile", { p_payload: payload });
    if (error) throw error;

    if (passwordMode && newPassword.trim()) {
      await callAdminUsers({ action: editor.user_id ? "reset_password" : "create_user", ...payload, password: newPassword.trim() });
    }
  }

  async function saveRoleCatalog() {
    const payload = {
      role: safeText(editor.role),
      label: safeText(editor.label),
      description: safeText(editor.description),
      sort_order: Number(editor.sort_order || 999),
      active: normalizeBool(editor.active),
    };

    if (!payload.role || !payload.label) {
      toast({ title: "Faltan datos", description: "Rol técnico y nombre visible son obligatorios.", variant: "destructive" });
      return;
    }

    const { error } = await (supabase as any).rpc("admin_role_catalog_save", {
      p_id: editor.id || null,
      p_payload: payload,
    });

    if (error) throw error;
  }



  async function saveCompany() {
    const payload = {
      name: safeText(editor.name),
      legal_name: safeText(editor.legal_name),
      tax_id: safeText(editor.tax_id),
      logo_storage_path: safeText(editor.logo_storage_path),
      active: normalizeBool(editor.active),
    };

    if (!payload.name) {
      toast({ title: "Faltan datos", description: "El nombre comercial es obligatorio.", variant: "destructive" });
      return;
    }

    const { error } = await (supabase as any).rpc("admin_company_save", {
      p_id: editor.id || null,
      p_payload: payload,
    });

    if (error) throw error;
  }

  async function saveShiftTemplate() {
    const payload = {
      name: safeText(editor.name),
      description: safeText(editor.description),
      start_time: safeText(editor.start_time),
      end_time: safeText(editor.end_time),
      lunch_start: safeText(editor.lunch_start) || null,
      lunch_end: safeText(editor.lunch_end) || null,
      lunch_minutes: Number(editor.lunch_minutes || 0),
      entry_tolerance_minutes: Number(editor.entry_tolerance_minutes || 10),
      exit_grace_minutes: Number(editor.exit_grace_minutes || 5),
      early_entry_minutes: Number(editor.early_entry_minutes || 0),
      weekly_hours: editor.weekly_hours === "" || editor.weekly_hours == null ? null : Number(editor.weekly_hours),
      color: safeText(editor.color) || "#2563eb",
      active: normalizeBool(editor.active),
    };

    if (!payload.name || !payload.start_time || !payload.end_time) {
      toast({ title: "Faltan datos", description: "Nombre, inicio y fin son obligatorios.", variant: "destructive" });
      return;
    }

    const { error } = await (supabase as any).rpc("admin_shift_template_save", {
      p_id: editor.id || null,
      p_payload: payload,
    });

    if (error) throw error;
  }

  async function saveGenericCatalog() {
    const payload = {
      name: safeText(editor.name),
      description: safeText(editor.description),
      active: normalizeBool(editor.active),
    };

    if (!payload.name) {
      toast({ title: "Faltan datos", description: "El nombre es obligatorio.", variant: "destructive" });
      return;
    }

    const { error } = await (supabase as any).rpc("admin_catalog_save_record", {
      p_catalog: activeCatalog.table,
      p_id: editor.id || null,
      p_payload: payload,
    });

    if (error) throw error;
  }

  async function saveEditor() {
    try {
      if (isPersonal) await savePersonal();
      else if (isCompanies) await saveCompany();
      else if (isRoles) await saveRoleCatalog();
      else if (isShifts) await saveShiftTemplate();
      else await saveGenericCatalog();

      toast({ title: "Guardado", description: isPersonal ? "Personal actualizado correctamente." : "Catálogo actualizado correctamente." });
      setEditorOpen(false);
      await loadRows();
    } catch (error: any) {
      console.error(error);
      toast({ title: "Error guardando", description: error.message || String(error), variant: "destructive" });
    }
  }

  async function toggleActive(row: AnyRow) {
    try {
      if (isPersonal) {
        const { error } = await (supabase as any).rpc("admin_access_save_profile", { p_payload: { ...row, profile_id: row.id, active: !rowActive(row) } });
        if (error) throw error;
      } else if (isRoles) {
        const { error } = await (supabase as any).rpc("admin_role_catalog_save", { p_id: row.id, p_payload: { ...row, active: !rowActive(row) } });
        if (error) throw error;
      } else if (isCompanies) {
        const { error } = await (supabase as any).rpc("admin_company_save", { p_id: row.id, p_payload: { ...row, active: !rowActive(row) } });
        if (error) throw error;
      } else if (isShifts) {
        const { error } = await (supabase as any).rpc("admin_shift_template_save", { p_id: row.id, p_payload: { ...row, active: !rowActive(row) } });
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).rpc("admin_catalog_save_record", { p_catalog: activeCatalog.table, p_id: row.id, p_payload: { ...row, active: !rowActive(row) } });
        if (error) throw error;
      }
      await loadRows();
    } catch (error: any) {
      toast({ title: "No se pudo cambiar estado", description: error.message || String(error), variant: "destructive" });
    }
  }

  async function importPersonalRows(importRows: AnyRow[]) {
    const mapped = importRows.map((row) => ({
      profile_id: row.id || row.profile_id || null,
      employee_code: row.employee_code || row.codigo || row.código || null,
      full_name: row.full_name || row.nombre || row.name || "",
      email: String(row.email || row.correo || "").toLowerCase(),
      role: row.role || row.rol || "employee",
      company_name: row.company_name || row.empresa || "Grupo Marport",
      department: row.department || row.area || row["área"] || "",
      work_center: row.work_center || row.centro || "",
      job_position: row.job_position || row.puesto || "",
      document_type: row.document_type || row.tipo_documento || "DNI",
      document_number: row.document_number || row.documento || "",
      birth_date: toInputDate(row.birth_date || row.fecha_nacimiento || row.nacimiento || null),
      phone: row.phone || row.telefono || row.teléfono || "",
      active: normalizeBool(row.active ?? row.activo ?? true),
    }));

    const { data, error } = await (supabase as any).rpc("admin_profiles_bulk_upsert", { p_rows: mapped });
    if (error) throw error;
    return data?.[0] || data;
  }

  async function runImport() {
    try {
      const parsed = parseCsv(importText);
      if (!parsed.length) throw new Error("No hay filas para importar.");

      if (isPersonal) {
        const result = await importPersonalRows(parsed);
        toast({ title: "Importación finalizada", description: `Leídas: ${result?.total ?? parsed.length}. Guardadas: ${result?.saved ?? "?"}.` });
      } else {
        toast({ title: "Importación no habilitada", description: "Importación masiva avanzada para este catálogo queda para la siguiente fase.", variant: "destructive" });
      }

      setImportOpen(false);
      setImportText("");
      await loadRows();
    } catch (error: any) {
      console.error(error);
      toast({ title: "Error importando", description: error.message || String(error), variant: "destructive" });
    }
  }

  async function handleCsvFile(file: File) {
    const text = await file.text();
    setImportText(text);
    setImportOpen(true);
  }

  function downloadTemplate() {
    if (isPersonal) {
      exportCsv("plantilla_personal_grupmar_time.csv", [{
        employee_code: "",
        full_name: "Nombre Apellido",
        email: "usuario@empresa.com",
        role: "employee",
        company_name: "Grupo Marport",
        department: "Sistemas",
        work_center: "Son Oms",
        job_position: "Técnico",
        document_type: "DNI",
        document_number: "",
        birth_date: "19/06/1990",
        phone: "",
        active: true,
      }], PERSONAL_COLUMNS);
      return;
    }

    exportCsv(`plantilla_${activeCatalog.table}.csv`, [Object.fromEntries(allColumns.map((c) => [c.key, ""]))], allColumns);
  }

  function exportCurrent() {
    exportCsv(`${isPersonal ? "personal" : activeCatalog.table}_grupmar_time.csv`, filteredRows, visibleColumns);
  }

  const activeRows = rows.filter(rowActive).length;
  const inactiveRows = rows.length - activeRows;
  const activeOptions = (list: AnyRow[]) => list.filter(rowActive);

  return (
    <div className="min-h-screen w-full bg-slate-50 p-2 md:p-3">
      <div className="w-full space-y-3">
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <Button variant="outline" size="icon" asChild><Link to="/admin"><ArrowLeft className="h-4 w-4" /></Link></Button>
            <div>
              <EditableUiText textKey="admin.maintenance.kicker" fallback="Mantenimiento canónico" as="p" className="text-xs font-black uppercase tracking-[0.24em] text-slate-400" />
              <EditableUiText textKey="admin.maintenance.title" fallback="Catálogos y personal" as="h1" className="text-2xl font-black text-slate-950" />
              <EditableUiText textKey="admin.maintenance.subtitle" fallback="Personal, empresas, áreas, centros, documentos, puestos, roles y turnos en una sola pantalla." as="p" className="text-sm text-slate-500" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={loadRows} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button>
            <Button variant="outline" onClick={downloadTemplate}><FileDown className="mr-2 h-4 w-4" />Plantilla</Button>
            <Button variant="outline" onClick={exportCurrent}>Exportar</Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()}><FileUp className="mr-2 h-4 w-4" />Importar</Button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleCsvFile(file); e.currentTarget.value = ""; }} />
            <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Nuevo</Button>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[210px_1fr]">
          <aside className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            <div className="mb-2 px-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400">Catálogos</div>
            <div className="space-y-1">
              {CATALOGS.map((item) => (
                <button key={item.key} type="button" onClick={() => setCatalog(item.key as CatalogKey)} className={["w-full rounded-xl px-2.5 py-2 text-left transition", item.key === catalog ? "bg-slate-950 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-slate-100"].join(" ")}>
                  <div className="flex items-center gap-2">{item.key === "personal" ? <Users className="h-4 w-4" /> : null}<span className="font-black">{item.label}</span></div>
                  <div className={item.key === catalog ? "line-clamp-2 text-xs text-white/70" : "line-clamp-2 text-xs text-slate-400"}>{item.description}</div>
                </button>
              ))}
            </div>
          </aside>

          <main className="min-w-0 space-y-3">
            {catalog === "celebrations" ? (
              <CelebrationsPage />
            ) : (
              <>
            <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">{activeCatalog.group}</p>
                  <h2 className="text-xl font-black text-slate-950">{activeCatalog.label}</h2>
                  <p className="text-sm text-slate-500">{activeCatalog.description}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  <div className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-700"><b>{activeRows}</b> activos</div>
                  <div className="rounded-xl bg-slate-100 px-3 py-2 text-slate-600"><b>{inactiveRows}</b> inactivos</div>
                  <div className="rounded-xl bg-blue-50 px-3 py-2 text-blue-700"><b>{filteredRows.length}</b> visibles</div>
                  <div className="rounded-xl bg-amber-50 px-3 py-2 text-amber-700"><b>{visibleColumns.length}</b> columnas</div>
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, email, código, centro, área..." className="pl-9" />
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                  {showInactive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  <Label className="text-sm">Mostrar inactivos</Label>
                  <Switch checked={showInactive} onCheckedChange={setShowInactive} />
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      {visibleColumns.map((column, index) => (
                        <th key={`${column.key}-${index}`} className="px-2 py-2 align-top">
                          <div className="flex min-w-[150px] items-center gap-1">
                            <Select value={column.key} onValueChange={(value) => replaceColumn(column.key, value)}>
                              <SelectTrigger className="h-8 min-w-[118px] border-slate-300 bg-white text-xs font-black"><SelectValue /></SelectTrigger>
                              <SelectContent>{allColumns.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
                            </Select>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Ordenar" onClick={() => sortBy(column.key)}>{setting.sort_key === column.key && setting.sort_dir === "desc" ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}</Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Mover izquierda" onClick={() => moveColumn(column.key, -1)}><ArrowLeft className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Mover derecha" onClick={() => moveColumn(column.key, 1)}><ArrowRight className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Ocultar columna" onClick={() => hideColumn(column.key)}><X className="h-3.5 w-3.5" /></Button>
                          </div>
                        </th>
                      ))}
                      <th className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {hiddenColumns.length ? (
                            <Select value="__add__" onValueChange={(value) => value !== "__add__" && showColumn(value)}>
                              <SelectTrigger className="h-8 w-[170px] border-slate-300 bg-white text-xs font-black"><SelectValue placeholder="+ Columna" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__add__">+ Agregar columna</SelectItem>
                                {hiddenColumns.map((key) => {
                                  const col = allColumns.find((c) => c.key === key);
                                  return col ? <SelectItem key={key} value={key}>{col.label}</SelectItem> : null;
                                })}
                              </SelectContent>
                            </Select>
                          ) : null}
                          <span>Acciones</span>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <tr key={row.id || row.email || JSON.stringify(row)} className="border-t border-slate-100">
                        {visibleColumns.map((column) => <td key={column.key} className="px-3 py-2 align-top">{renderCell(row, column)}</td>)}
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="icon" title="Editar ficha" onClick={() => openEdit(row)}><Pencil className="h-4 w-4" /></Button>
                            {isPersonal ? <Button variant="outline" size="icon" title="Cambiar clave" onClick={() => openPassword(row)}><KeyRound className="h-4 w-4" /></Button> : null}
                            <Button variant="outline" size="icon" title="Activar/Inactivar" onClick={() => toggleActive(row)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!filteredRows.length ? <div className="p-10 text-center text-sm text-slate-500">{loading ? "Cargando..." : "No hay registros para mostrar."}</div> : null}
            </section>
              </>
            )}
          </main>
        </div>
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto rounded-3xl">
          <DialogHeader><DialogTitle>{isPersonal ? "Ficha de personal" : isRoles ? "Mantenimiento · Roles" : `Mantenimiento · ${activeCatalog.label}`}</DialogTitle></DialogHeader>

          {isPersonal ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>Código</Label><Input value={editor.employee_code || "Automático"} disabled /></div>
              <div className="space-y-2"><Label>Activo</Label><div className="flex items-center gap-3 rounded-2xl border px-3 py-2"><Switch checked={normalizeBool(editor.active)} onCheckedChange={(checked) => setEditor((prev) => ({ ...prev, active: checked }))} /><span className="text-sm text-slate-600">{normalizeBool(editor.active) ? "Trabajador activo" : "Trabajador inactivo"}</span></div></div>
              <div className="space-y-2 md:col-span-2"><Label>Nombre completo</Label><Input value={editor.full_name || ""} onChange={(e) => setEditor((prev) => ({ ...prev, full_name: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Email / usuario</Label><Input type="email" value={editor.email || ""} onChange={(e) => setEditor((prev) => ({ ...prev, email: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Rol</Label><Select value={editor.role || "employee"} onValueChange={(value) => setEditor((prev) => ({ ...prev, role: value }))}><SelectTrigger><SelectValue placeholder="Rol" /></SelectTrigger><SelectContent>{activeOptions(roles).length ? activeOptions(roles).map((r) => <SelectItem key={r.id || r.role} value={r.role}>{r.label || r.role}</SelectItem>) : <><SelectItem value="admin">Admin</SelectItem><SelectItem value="rrhh">RRHH</SelectItem><SelectItem value="employee">Empleado</SelectItem></>}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Empresa</Label><Select value={editor.company_name || "Grupo Marport"} onValueChange={(value) => setEditor((prev) => ({ ...prev, company_name: value }))}><SelectTrigger><SelectValue placeholder="Empresa" /></SelectTrigger><SelectContent>{activeOptions(companies).map((c) => <SelectItem key={c.id || c.name} value={c.name}>{c.name}</SelectItem>)}{!activeOptions(companies).length ? <SelectItem value="Grupo Marport">Grupo Marport</SelectItem> : null}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Área</Label><Select value={editor.department || "__none__"} onValueChange={(value) => setEditor((prev) => ({ ...prev, department: value === "__none__" ? "" : value }))}><SelectTrigger><SelectValue placeholder="Área" /></SelectTrigger><SelectContent><SelectItem value="__none__">Sin área</SelectItem>{activeOptions(departments).map((d) => <SelectItem key={d.id || d.name} value={d.name}>{d.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Centro</Label><Select value={editor.work_center || "__none__"} onValueChange={(value) => setEditor((prev) => ({ ...prev, work_center: value === "__none__" ? "" : value }))}><SelectTrigger><SelectValue placeholder="Centro" /></SelectTrigger><SelectContent><SelectItem value="__none__">Sin centro</SelectItem>{activeOptions(centers).map((c) => <SelectItem key={c.id || c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Puesto</Label><Select value={editor.job_position || "__none__"} onValueChange={(value) => setEditor((prev) => ({ ...prev, job_position: value === "__none__" ? "" : value }))}><SelectTrigger><SelectValue placeholder="Puesto" /></SelectTrigger><SelectContent><SelectItem value="__none__">Sin puesto</SelectItem>{activeOptions(positions).map((p) => <SelectItem key={p.id || p.name} value={p.name}>{p.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Tipo documento</Label><Select value={editor.document_type || "DNI"} onValueChange={(value) => setEditor((prev) => ({ ...prev, document_type: value }))}><SelectTrigger><SelectValue placeholder="Documento" /></SelectTrigger><SelectContent>{activeOptions(documentTypes).map((d) => <SelectItem key={d.id || d.name} value={d.name || d.code}>{d.name || d.code}</SelectItem>)}<SelectItem value="DNI">DNI</SelectItem><SelectItem value="NIE">NIE</SelectItem><SelectItem value="PASAPORTE">Pasaporte</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>Número documento</Label><Input value={editor.document_number || ""} onChange={(e) => setEditor((prev) => ({ ...prev, document_number: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Fecha de nacimiento</Label><Input type="date" value={editor.birth_date || ""} onChange={(e) => setEditor((prev) => ({ ...prev, birth_date: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Teléfono</Label><Input value={editor.phone || ""} onChange={(e) => setEditor((prev) => ({ ...prev, phone: e.target.value }))} /></div>
              <div className="md:col-span-2 rounded-3xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><div><div className="font-black text-slate-950">Cambiar clave / Auth</div><div className="text-sm text-slate-500">Activa esta opción para crear usuario Auth o cambiar/resetear la clave.</div></div><Switch checked={passwordMode} onCheckedChange={setPasswordMode} /></div>{passwordMode ? <div className="mt-4 flex gap-2"><Input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Nueva contraseña" /><Button type="button" variant="outline" onClick={() => setNewPassword(`Gmt-${Math.random().toString(36).slice(2, 8)}-${new Date().getFullYear()}!`)}><KeyRound className="mr-2 h-4 w-4" />Generar</Button></div> : null}</div>
            </div>
          ) : isCompanies ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nombre comercial</Label>
                <Input value={editor.name || ""} onChange={(e) => setEditor((prev) => ({ ...prev, name: e.target.value }))} placeholder="Grupo Marport" />
              </div>
              <div className="space-y-2">
                <Label>Razón social</Label>
                <Input value={editor.legal_name || ""} onChange={(e) => setEditor((prev) => ({ ...prev, legal_name: e.target.value }))} placeholder="Grupo Marport, S.L." />
              </div>
              <div className="space-y-2">
                <Label>CIF/NIF</Label>
                <Input value={editor.tax_id || ""} onChange={(e) => setEditor((prev) => ({ ...prev, tax_id: e.target.value }))} placeholder="B00000000" />
                <p className="text-xs text-slate-500">Este campo se guarda en companies.tax_id.</p>
              </div>
              <div className="space-y-2">
                <Label>Logo storage path</Label>
                <Input value={editor.logo_storage_path || ""} onChange={(e) => setEditor((prev) => ({ ...prev, logo_storage_path: e.target.value }))} placeholder="logos/grupo-marport.png" />
              </div>
              <div className="md:col-span-2 flex items-center gap-3 rounded-2xl border px-3 py-2">
                <Switch checked={normalizeBool(editor.active)} onCheckedChange={(checked) => setEditor((prev) => ({ ...prev, active: checked }))} />
                <span className="text-sm text-slate-600">{normalizeBool(editor.active) ? "Empresa activa" : "Empresa inactiva"}</span>
              </div>
            </div>
          ) : isRoles ? (
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>Rol técnico</Label>
                <Select value={editor.role || "employee"} onValueChange={(value) => setEditor((prev) => ({ ...prev, role: value }))}>
                  <SelectTrigger><SelectValue placeholder="Rol técnico" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">admin</SelectItem>
                    <SelectItem value="rrhh">rrhh</SelectItem>
                    <SelectItem value="marketing">marketing</SelectItem>
                    <SelectItem value="manager">manager</SelectItem>
                    <SelectItem value="employee">employee</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">Campo técnico del enum app_role. Define permisos reales del sistema.</p>
              </div>
              <div className="space-y-2"><Label>Nombre visible</Label><Input value={editor.label || ""} onChange={(e) => setEditor((prev) => ({ ...prev, label: e.target.value }))} placeholder="Administrador, RRHH, Empleado..." /></div>
              <div className="space-y-2"><Label>Descripción</Label><Textarea value={editor.description || ""} onChange={(e) => setEditor((prev) => ({ ...prev, description: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Orden</Label><Input type="number" value={editor.sort_order ?? 999} onChange={(e) => setEditor((prev) => ({ ...prev, sort_order: Number(e.target.value || 999) }))} /></div>
              <div className="flex items-center gap-3 rounded-2xl border px-3 py-2"><Switch checked={normalizeBool(editor.active)} onCheckedChange={(checked) => setEditor((prev) => ({ ...prev, active: checked }))} /><span className="text-sm text-slate-600">{normalizeBool(editor.active) ? "Activo" : "Inactivo"}</span></div>
            </div>
          ) : isShifts ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Nombre del turno</Label>
                <Input value={editor.name || ""} onChange={(e) => setEditor((prev) => ({ ...prev, name: e.target.value }))} placeholder="Oficina 08:00 - 17:00" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Descripción</Label>
                <Textarea value={editor.description || ""} onChange={(e) => setEditor((prev) => ({ ...prev, description: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Hora inicio</Label>
                <Input type="time" value={editor.start_time || ""} onChange={(e) => setEditor((prev) => ({ ...prev, start_time: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Hora fin</Label>
                <Input type="time" value={editor.end_time || ""} onChange={(e) => setEditor((prev) => ({ ...prev, end_time: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Almuerzo inicio</Label>
                <Input type="time" value={editor.lunch_start || ""} onChange={(e) => setEditor((prev) => ({ ...prev, lunch_start: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Almuerzo fin</Label>
                <Input type="time" value={editor.lunch_end || ""} onChange={(e) => setEditor((prev) => ({ ...prev, lunch_end: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Minutos almuerzo</Label>
                <Input type="number" value={editor.lunch_minutes ?? 0} onChange={(e) => setEditor((prev) => ({ ...prev, lunch_minutes: Number(e.target.value || 0) }))} />
              </div>
              <div className="space-y-2">
                <Label>Tolerancia entrada</Label>
                <Input type="number" value={editor.entry_tolerance_minutes ?? 10} onChange={(e) => setEditor((prev) => ({ ...prev, entry_tolerance_minutes: Number(e.target.value || 10) }))} />
              </div>
              <div className="space-y-2">
                <Label>Gracia salida</Label>
                <Input type="number" value={editor.exit_grace_minutes ?? 5} onChange={(e) => setEditor((prev) => ({ ...prev, exit_grace_minutes: Number(e.target.value || 5) }))} />
              </div>
              <div className="space-y-2">
                <Label>Horas semana</Label>
                <Input type="number" step="0.5" value={editor.weekly_hours ?? ""} onChange={(e) => setEditor((prev) => ({ ...prev, weekly_hours: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex gap-2">
                  <Input type="color" value={editor.color || "#2563eb"} onChange={(e) => setEditor((prev) => ({ ...prev, color: e.target.value }))} className="h-10 w-16 p-1" />
                  <Input value={editor.color || "#2563eb"} onChange={(e) => setEditor((prev) => ({ ...prev, color: e.target.value }))} />
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border px-3 py-2">
                <Switch checked={normalizeBool(editor.active)} onCheckedChange={(checked) => setEditor((prev) => ({ ...prev, active: checked }))} />
                <span className="text-sm text-slate-600">{normalizeBool(editor.active) ? "Turno activo" : "Turno inactivo"}</span>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="space-y-2"><Label>Código</Label><Input value={editor.code || "Automático"} disabled /></div>
              <div className="space-y-2"><Label>Nombre</Label><Input value={editor.name || ""} onChange={(e) => setEditor((prev) => ({ ...prev, name: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Descripción</Label><Textarea value={editor.description || ""} onChange={(e) => setEditor((prev) => ({ ...prev, description: e.target.value }))} /></div>
              <div className="flex items-center gap-3 rounded-2xl border px-3 py-2"><Switch checked={normalizeBool(editor.active)} onCheckedChange={(checked) => setEditor((prev) => ({ ...prev, active: checked }))} /><span className="text-sm text-slate-600">{normalizeBool(editor.active) ? "Activo" : "Inactivo"}</span></div>
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setEditorOpen(false)}>Cancelar</Button><Button onClick={saveEditor}>Guardar</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-4xl rounded-3xl">
          <DialogHeader><DialogTitle>Importar {activeCatalog.label}</DialogTitle></DialogHeader>
          <div className="space-y-3"><p className="text-sm text-slate-500">Pega CSV con cabeceras o carga un archivo. Separador aceptado: punto y coma o coma.</p><Textarea className="min-h-[300px] font-mono text-xs" value={importText} onChange={(e) => setImportText(e.target.value)} /></div>
          <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setImportOpen(false)}>Cancelar</Button><Button onClick={runImport}><Upload className="mr-2 h-4 w-4" />Importar</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


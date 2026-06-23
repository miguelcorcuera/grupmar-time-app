import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  FileText,
  GripVertical,
  MapPin,
  Printer,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  TrendingUp,
  Users,
} from "lucide-react";
import { formatTime } from "@/lib/grupmar";
import {
  AccessMap,
  ACCESS_SECURITY_VERSION,
  readAccessSnapshots,
  riskClasses,
  riskLabel,
  RiskIcon,
  type AccessSnapshot,
} from "@/lib/accessSecurity";
import { VersionBadge } from "@/lib/grupmarAdminLocal";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/attendance")({
  head: () => ({ meta: [{ title: "Administrador de Marcaciones — GrupMar Time" }] }),
  component: AttendancePage,
});

type DailyRow = {
  employee_id: string;
  full_name: string;
  department: string | null;
  work_center: string | null;
  shift: string | null;
  attendance_date: string;
  expected_entry_time: string | null;
  actual_entry_time: string | null;
  status: string | null;
  has_tardiness: boolean;
  late_minutes_total: number;
  late_minutes_after_tolerance: number;
  ip_address: string | null;
  connection_location_status: string | null;
  security_flag: boolean;
  is_absent: boolean;
};

type Employee = {
  id: string;
  full_name: string;
  email?: string | null;
  department?: string | null;
  center?: string | null;
  active?: boolean | null;
};

type Shift = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  tolerance_minutes?: number | null;
};

type Plan = {
  id: string;
  employee_id: string;
  shift_id: string;
  date: string;
  published?: boolean | null;
};

type ReportRow = {
  id: string;
  date: string;
  employee: string;
  department: string;
  center: string;
  shift: string;
  expectedEntry: string;
  expectedExit: string;
  entry: string | null;
  exit: string | null;
  lunchStart: string | null;
  lunchEnd: string | null;
  status: "ok" | "late" | "absent" | "pending" | "review";
  lateMinutes: number;
  workedMinutes: number | null;
  ip: string;
  network: string;
  gps: string;
  source: "Supabase" | "Local" | "Mixto";
};

const ATTENDANCE_ADMIN_VERSION = "Marcaciones admin v12.8 · panel seleccionable + calendario celeste · 18/06/2026 16:35";

type AdminModuleId = "filters" | "kpis" | "calendar" | "trend" | "daily" | "executive" | "map" | "detail";
type ReportMode = "general" | "person";
type PeriodMode = "today" | "week" | "month" | "year" | "custom";

const ADMIN_ATTENDANCE_ORDER_KEY = "grupmar_time_admin_attendance_module_order_v1";
const ADMIN_ATTENDANCE_VISIBLE_KEY = "grupmar_time_admin_attendance_visible_modules_v1";
const DEFAULT_ADMIN_MODULE_ORDER: AdminModuleId[] = ["filters", "kpis", "calendar", "trend", "daily", "executive", "map", "detail"];
const ADMIN_MODULE_LABELS: Record<AdminModuleId, string> = {
  filters: "Filtros y exportación",
  kpis: "Balance ejecutivo",
  calendar: "Calendario",
  trend: "Puntualidad vs tardanza",
  daily: "Reporte del día",
  executive: "Vista ejecutiva",
  map: "Mapa / evidencias",
  detail: "Detalle completo",
};

function readAdminModuleOrder(): AdminModuleId[] {
  if (typeof window === "undefined") return DEFAULT_ADMIN_MODULE_ORDER;
  try {
    const raw = window.localStorage.getItem(ADMIN_ATTENDANCE_ORDER_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const clean = Array.isArray(parsed) ? parsed.filter((x) => DEFAULT_ADMIN_MODULE_ORDER.includes(x)) as AdminModuleId[] : [];
    return [...clean, ...DEFAULT_ADMIN_MODULE_ORDER.filter((x) => !clean.includes(x))];
  } catch { return DEFAULT_ADMIN_MODULE_ORDER; }
}
function saveAdminModuleOrder(order: AdminModuleId[]) {
  if (typeof window !== "undefined") window.localStorage.setItem(ADMIN_ATTENDANCE_ORDER_KEY, JSON.stringify(order));
}
function readAdminVisibleModules(): AdminModuleId[] {
  if (typeof window === "undefined") return DEFAULT_ADMIN_MODULE_ORDER;
  try {
    const raw = window.localStorage.getItem(ADMIN_ATTENDANCE_VISIBLE_KEY);
    if (!raw) return DEFAULT_ADMIN_MODULE_ORDER;
    const parsed = JSON.parse(raw);
    const clean = Array.isArray(parsed) ? parsed.filter((x) => DEFAULT_ADMIN_MODULE_ORDER.includes(x)) as AdminModuleId[] : DEFAULT_ADMIN_MODULE_ORDER;
    return clean;
  } catch { return DEFAULT_ADMIN_MODULE_ORDER; }
}
function saveAdminVisibleModules(modules: AdminModuleId[]) {
  if (typeof window !== "undefined") window.localStorage.setItem(ADMIN_ATTENDANCE_VISIBLE_KEY, JSON.stringify(modules));
}

function eventLabel(type: string) {
  const map: Record<string, string> = {
    ENTRY_LOGIN: "Entrada / login",
    ENTRY: "Entrada",
    LUNCH_START: "Inicio almuerzo",
    LUNCH_END: "Fin almuerzo",
    PERMISSION_START: "Salida permiso",
    PERMISSION_END: "Retorno permiso",
    EXTRA_EXIT_START: "Salida extra",
    EXTRA_EXIT_END: "Retorno extra",
    EXIT: "Salida final",
  };
  return map[type] ?? type;
}

function ymd(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + days);
  return ymd(d);
}

function mondayOf(date: string) {
  const d = new Date(date + "T12:00:00");
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return ymd(d);
}

function prettyDate(date: string) {
  return new Date(date + "T12:00:00").toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "short" });
}

function timeOnly(value?: string | null) {
  if (!value) return null;
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  try {
    return new Date(value).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return value.slice(0, 5);
  }
}

function minutesOf(value?: string | null) {
  const t = timeOnly(value);
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function diffEventMinutes(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 60000);
}

function fmtMinutes(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const h = Math.floor(value / 60);
  const m = value % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

function statusText(status: ReportRow["status"]) {
  if (status === "ok") return "A tiempo";
  if (status === "late") return "Tardanza";
  if (status === "absent") return "Ausente";
  if (status === "review") return "Revisión";
  return "Pendiente";
}

function statusBadge(status: ReportRow["status"]) {
  if (status === "ok") return <Badge className="bg-emerald-600 text-white">A tiempo</Badge>;
  if (status === "late") return <Badge className="bg-rose-600 text-white">Tardanza</Badge>;
  if (status === "absent") return <Badge className="bg-slate-700 text-white">Ausente</Badge>;
  if (status === "review") return <Badge className="bg-amber-500 text-black">Revisión</Badge>;
  return <Badge variant="outline">Pendiente</Badge>;
}

function networkBadge(status: string) {
  if (status === "company_network" || status === "Oficina validada") return <Badge className="bg-emerald-600 text-white gap-1"><ShieldCheck className="w-3 h-3" /> Oficina</Badge>;
  if (status === "outside_company_network") return <Badge className="bg-amber-500 text-black gap-1"><ShieldAlert className="w-3 h-3" /> Fuera</Badge>;
  if (status === "unknown") return <Badge variant="secondary" className="gap-1"><ShieldX className="w-3 h-3" /> Sin validar</Badge>;
  return <Badge variant="outline">—</Badge>;
}

function getDateRange(from: string, to: string) {
  const out: string[] = [];
  let cursor = from;
  while (cursor <= to && out.length < 370) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

function escapeXml(value: unknown) {
  return String(value ?? "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function utf8(value: string) {
  return new TextEncoder().encode(value);
}

function bytesFromNumbers(values: number[]) {
  return new Uint8Array(values.map((v) => v & 255));
}

function concatBytes(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function u16bytes(n: number) {
  return bytesFromNumbers([n, n >> 8]);
}

function u32bytes(n: number) {
  return bytesFromNumbers([n, n >> 8, n >> 16, n >> 24]);
}

function crc32Bytes(bytes: Uint8Array) {
  let crc = ~0;
  for (const b of bytes) {
    crc ^= b;
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

function makeZip(files: Record<string, string>) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const entries = Object.entries(files);

  for (const [name, content] of entries) {
    const nameBytes = utf8(name);
    const contentBytes = utf8(content);
    const crc = crc32Bytes(contentBytes);
    const size = contentBytes.length;

    const localHeader = concatBytes([
      bytesFromNumbers([0x50, 0x4b, 0x03, 0x04]),
      u16bytes(20),
      u16bytes(0),
      u16bytes(0),
      u16bytes(0),
      u16bytes(0),
      u32bytes(crc),
      u32bytes(size),
      u32bytes(size),
      u16bytes(nameBytes.length),
      u16bytes(0),
      nameBytes,
    ]);

    localParts.push(localHeader, contentBytes);

    const centralHeader = concatBytes([
      bytesFromNumbers([0x50, 0x4b, 0x01, 0x02]),
      u16bytes(20),
      u16bytes(20),
      u16bytes(0),
      u16bytes(0),
      u16bytes(0),
      u16bytes(0),
      u32bytes(crc),
      u32bytes(size),
      u32bytes(size),
      u16bytes(nameBytes.length),
      u16bytes(0),
      u16bytes(0),
      u16bytes(0),
      u16bytes(0),
      u32bytes(0),
      u32bytes(offset),
      nameBytes,
    ]);
    centralParts.push(centralHeader);
    offset += localHeader.length + contentBytes.length;
  }

  const body = concatBytes(localParts);
  const central = concatBytes(centralParts);
  const end = concatBytes([
    bytesFromNumbers([0x50, 0x4b, 0x05, 0x06]),
    u16bytes(0),
    u16bytes(0),
    u16bytes(entries.length),
    u16bytes(entries.length),
    u32bytes(central.length),
    u32bytes(body.length),
    u16bytes(0),
  ]);
  return concatBytes([body, central, end]);
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 500);
}

function excelColumn(index: number) {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function exportXlsx(rows: ReportRow[], filename: string, title = "Reporte de marcaciones", subtitle = "") {
  if (!rows.length) { toast.error("No hay filas para generar Excel."); return; }

  const safeFilename = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  const k = buildExecutiveKpis(rows);
  const headers = [
    "Fecha", "Trabajador", "Departamento", "Centro", "Turno",
    "Entrada esperada", "Salida esperada", "Entrada real", "Inicio almuerzo", "Fin almuerzo", "Salida real",
    "Estado", "Tarde min", "Trabajado", "IP", "Red/GPS", "Fuente",
  ];

  const allRows = [
    [title],
    [subtitle || `Generado ${new Date().toLocaleString("es-ES")}`],
    [`Registros: ${k.total}`, `A tiempo: ${k.ok}`, `Tardanzas: ${k.late}`, `Ausentes: ${k.absent}`, `Pendientes: ${k.pending}`, `Puntualidad: ${k.punctuality}%`],
    headers,
    ...rows.map((r) => [
      r.date, r.employee, r.department, r.center, r.shift,
      r.expectedEntry, r.expectedExit, timeOnly(r.entry) ?? "—", timeOnly(r.lunchStart) ?? "—", timeOnly(r.lunchEnd) ?? "—", timeOnly(r.exit) ?? "—",
      statusText(r.status), String(r.lateMinutes || 0), fmtMinutes(r.workedMinutes), r.ip, `${r.network} ${r.gps}`, r.source,
    ]),
  ];

  const sheetData = allRows.map((row, rowIndex) => {
    const r = rowIndex + 1;
    const cells = row.map((cell, colIndex) => {
      const ref = `${excelColumn(colIndex)}${r}`;
      return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(cell)}</t></is></c>`;
    }).join("");
    return `<row r="${r}">${cells}</row>`;
  }).join("");

  const lastCol = excelColumn(headers.length - 1);
  const lastRow = Math.max(4, allRows.length);

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <fileVersion appName="xl" lastEdited="7" lowestEdited="7" rupBuild="23426"/>
  <workbookPr defaultThemeVersion="166925"/>
  <sheets><sheet name="Marcaciones" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastCol}${lastRow}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>
    <col min="1" max="1" width="13" customWidth="1"/>
    <col min="2" max="2" width="28" customWidth="1"/>
    <col min="3" max="5" width="18" customWidth="1"/>
    <col min="6" max="13" width="16" customWidth="1"/>
    <col min="14" max="17" width="20" customWidth="1"/>
  </cols>
  <sheetData>${sheetData}</sheetData>
  <autoFilter ref="A4:${lastCol}${lastRow}"/>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;

  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
    "xl/workbook.xml": workbook,
    "xl/worksheets/sheet1.xml": sheet,
  };

  const blob = new Blob([makeZip(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  downloadBlob(safeFilename, blob);
  toast.success(`Excel generado: ${safeFilename}`);
}

function pdfSafe(value: unknown, max = 160) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[()\\]/g, " ")
    .slice(0, max);
}

function pdfText(line: string, x: number, y: number, size = 9, bold = false) {
  return `BT 0 0 0 rg /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${pdfSafe(line)}) Tj ET`;
}
function pdfTextRight(line: string, x: number, y: number, size = 9, bold = false) {
  const clean = pdfSafe(line);
  const approx = clean.length * size * 0.45;
  return pdfText(clean, x - approx, y, size, bold);
}
function pdfVertical(line: string, x: number, y: number) {
  return `BT /F1 7 Tf 0 1 -1 0 ${x} ${y} Tm (${pdfSafe(line, 120)}) Tj ET`;
}
function pdfRect(x: number, y: number, w: number, h: number, fill = "1 1 1", stroke = "0.74 0.74 0.74") {
  return `q ${fill} rg ${stroke} RG ${x} ${y} ${w} ${h} re B Q`;
}
function pdfLine(x1: number, y1: number, x2: number, y2: number, color = "0.72 0.72 0.72", width = 0.5) {
  return `q ${color} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S Q`;
}

function buildExecutiveKpis(rows: ReportRow[]) {
  const total = rows.length;
  const ok = rows.filter((r) => r.status === "ok").length;
  const late = rows.filter((r) => r.status === "late").length;
  const absent = rows.filter((r) => r.status === "absent").length;
  const pending = rows.filter((r) => r.status === "pending").length;
  const review = rows.filter((r) => r.status === "review").length;
  const counted = ok + late;
  const punctuality = counted ? Math.round((ok / counted) * 100) : 0;
  return { total, ok, late, absent, pending, review, punctuality };
}

function exportExecutivePdf(rows: ReportRow[], filename: string, title: string, subtitle: string) {
  if (!rows.length) { toast.error("No hay filas para generar PDF."); return; }

  const k = buildExecutiveKpis(rows);
  const pageW = 595;
  const pageH = 842;
  const margin = 44;
  const generated = new Date().toLocaleString("es-ES");
  const footer = `${title} · ${subtitle} · ${generated}`;
  const pages: string[] = [];

  const byDate = rows.reduce<Record<string, ReportRow[]>>((acc, r) => { (acc[r.date] ||= []).push(r); return acc; }, {});
  const dateRows = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b));
  const byEmployee = rows.reduce<Record<string, ReportRow[]>>((acc, r) => { (acc[r.employee] ||= []).push(r); return acc; }, {});

  function rect(x: number, y: number, w: number, h: number, rgb = "1 1 1", stroke = true) {
    return `${rgb} rg ${x} ${y} ${w} ${h} re f\n${stroke ? `0.74 0.74 0.74 RG ${x} ${y} ${w} ${h} re S\n` : ""}`;
  }

  function rowLine(y: number, cells: string[], widths: number[], opts?: { header?: boolean; total?: boolean; warn?: boolean; muted?: boolean }) {
    let x = margin;
    const h = opts?.header ? 18 : 16;
    const bg = opts?.header ? "0.84 0.92 0.95" : opts?.total ? "0.79 0.90 0.72" : opts?.warn ? "1 0.94 0.82" : opts?.muted ? "0.94 0.94 0.94" : "1 1 1";
    let out = rect(x, y - h + 4, widths.reduce((a, b) => a + b, 0), h, bg, true);
    cells.forEach((c, i) => {
      out += pdfText(c, x + 4, y - 8, opts?.header || opts?.total ? 8 : 7, !!opts?.header || !!opts?.total);
      x += widths[i];
      out += `0.82 0.82 0.82 RG ${x} ${y - h + 4} m ${x} ${y + 4} l S\n`;
    });
    return out;
  }

  function pageTemplate(sideText: string, body: string, pageNo: number) {
    return [
      "q",
      "0.55 0.55 0.55 rg",
      `BT /F1 7 Tf 14 170 Td 90 Tz (${pdfSafe(sideText, 105)}) Tj ET`,
      "Q",
      body,
      pdfText(footer, margin, 20, 7),
      pdfTextRight(String(pageNo), pageW - margin, 20, 7),
    ].join("\n");
  }

  let pageNo = 1;

  let body = "";
  body += pdfText("INFORME EJECUTIVO DE MARCACIONES", margin, 800, 19, true);
  body += pdfText(title, margin, 776, 15, true);
  body += pdfText(`periodo ${subtitle}`, margin, 758, 10);
  body += rect(margin, 690, pageW - margin * 2, 48, "0.99 0.96 0.82", true);
  body += pdfText("INFORMACION CONFIDENCIAL.", margin + 10, 724, 9, true);
  body += pdfText("Reporte interno de control horario. Uso autorizado para administracion, coordinadores y jefes de equipo.", margin + 10, 708, 8);
  body += pdfText(`Descarga registrada en GrupMar Time. Generado: ${generated}.`, margin + 10, 694, 8);

  body += pdfText("1. Identificacion", margin, 650, 13, true);
  body += rowLine(628, ["Reporte", title], [150, 355], { header: true });
  body += rowLine(610, ["Periodo", subtitle], [150, 355]);
  body += rowLine(592, ["Generado", generated], [150, 355]);
  body += rowLine(574, ["Fuente", "Supabase / registros locales de marcacion y Geo-IP"], [150, 355]);

  body += pdfText("2. Resumen ejecutivo", margin, 532, 13, true);
  body += rowLine(510, ["Registros", "A tiempo", "Tardanzas", "Ausentes", "Pendientes", "% Puntualidad"], [78, 78, 78, 78, 78, 115], { header: true });
  body += rowLine(492, [String(k.total), String(k.ok), String(k.late), String(k.absent), String(k.pending), `${k.punctuality}%`], [78, 78, 78, 78, 78, 115], { total: true });

  body += pdfText("3. Balance por trabajador", margin, 448, 13, true);
  body += rowLine(426, ["Trabajador", "Reg.", "OK", "Tarde", "Aus.", "Pend.", "Trabajado", "Min tarde"], [170, 44, 44, 52, 44, 50, 70, 58], { header: true });
  let y = 408;
  Object.entries(byEmployee).slice(0, 12).forEach(([employee, items]) => {
    const kk = buildExecutiveKpis(items);
    const worked = items.reduce((sum, r) => sum + (r.workedMinutes ?? 0), 0);
    const late = items.reduce((sum, r) => sum + (r.lateMinutes ?? 0), 0);
    body += rowLine(y, [employee, String(items.length), String(kk.ok), String(kk.late), String(kk.absent), String(kk.pending), fmtMinutes(worked), String(late || "—")], [170, 44, 44, 52, 44, 50, 70, 58], { warn: kk.late > 0 });
    y -= 17;
  });
  pages.push(pageTemplate(title, body, pageNo++));

  body = "";
  body += pdfText("4. Calendario del periodo", margin, 800, 15, true);
  body += rowLine(778, ["Fecha", "Dia", "Registros", "A tiempo", "Tardanzas", "Ausencias", "Pendientes"], [80, 58, 70, 70, 75, 75, 78], { header: true });
  y = 760;
  dateRows.slice(0, 35).forEach(([date, items]) => {
    const kk = buildExecutiveKpis(items);
    body += rowLine(y, [date.slice(5), prettyDate(date), String(items.length), String(kk.ok), String(kk.late), String(kk.absent), String(kk.pending)], [80, 58, 70, 70, 75, 75, 78], { warn: kk.late > 0, muted: items.length === 0 });
    y -= 17;
  });
  body += rowLine(y - 4, ["TOTAL", "", String(k.total), String(k.ok), String(k.late), String(k.absent), String(k.pending)], [80, 58, 70, 70, 75, 75, 78], { total: true });
  pages.push(pageTemplate(title, body, pageNo++));

  const chunks: ReportRow[][] = [];
  for (let i = 0; i < rows.length; i += 30) chunks.push(rows.slice(i, i + 30));
  chunks.forEach((chunk, idx) => {
    body = "";
    body += pdfText(`5. Detalle de marcaciones${chunks.length > 1 ? ` (${idx + 1}/${chunks.length})` : ""}`, margin, 800, 15, true);
    body += rowLine(778, ["Fecha", "Trabajador", "Turno", "Esperada", "Entrada", "Salida", "Estado", "Tarde"], [58, 150, 92, 55, 55, 55, 70, 45], { header: true });
    y = 760;
    chunk.forEach((r) => {
      body += rowLine(y, [r.date.slice(5), r.employee, r.shift, r.expectedEntry, timeOnly(r.entry) ?? "—", timeOnly(r.exit) ?? "—", statusText(r.status), r.lateMinutes ? String(r.lateMinutes) : "—"], [58, 150, 92, 55, 55, 55, 70, 45], { warn: r.status === "late", muted: r.status === "absent" });
      y -= 17;
    });
    pages.push(pageTemplate(title, body, pageNo++));
  });

  body = "";
  body += pdfText("6. Suplemento grafico", margin, 800, 15, true);
  body += pdfText("Evolucion de puntualidad vs tardanzas en el periodo seleccionado.", margin, 780, 9);
  const graphX = margin + 10;
  const graphY = 500;
  const graphW = pageW - margin * 2 - 20;
  const graphH = 210;
  body += rect(graphX, graphY, graphW, graphH, "0.98 0.98 0.98", true);
  const graphData = dateRows.map(([date, items]) => {
    const kk = buildExecutiveKpis(items);
    return { date, ok: kk.ok, late: kk.late };
  }).slice(-31);
  const max = Math.max(1, ...graphData.flatMap((d) => [d.ok, d.late]));
  const gx = (i: number) => graphData.length <= 1 ? graphX + 20 : graphX + 24 + (i * (graphW - 48)) / (graphData.length - 1);
  const gy = (v: number) => graphY + 28 + (v * (graphH - 56)) / max;
  [0,1,2,3,4].forEach((n) => {
    const yy = graphY + 28 + n * ((graphH - 56) / 4);
    body += `0.88 0.88 0.88 RG ${graphX + 20} ${yy} m ${graphX + graphW - 20} ${yy} l S\n`;
  });
  if (graphData.length) {
    body += "0.02 0.45 0.20 RG 2.2 w ";
    graphData.forEach((d, i) => { body += `${i ? "L" : "M"} ${gx(i)} ${gy(d.ok)} `; });
    body += "S\n";
    body += "0.75 0.10 0.10 RG 2.2 w ";
    graphData.forEach((d, i) => { body += `${i ? "L" : "M"} ${gx(i)} ${gy(d.late)} `; });
    body += "S\n";
    graphData.forEach((d, i) => {
      body += `0.02 0.45 0.20 rg ${gx(i)-2} ${gy(d.ok)-2} 4 4 re f\n`;
      body += `0.75 0.10 0.10 rg ${gx(i)-2} ${gy(d.late)-2} 4 4 re f\n`;
      body += pdfText(d.date.slice(5), gx(i)-9, graphY + 10, 6);
    });
  }
  body += pdfText("A tiempo", graphX + 24, graphY + graphH + 22, 9, true);
  body += `0.02 0.45 0.20 rg ${graphX + 10} ${graphY + graphH + 18} 8 8 re f\n`;
  body += pdfText("Tardanzas", graphX + 110, graphY + graphH + 22, 9, true);
  body += `0.75 0.10 0.10 rg ${graphX + 96} ${graphY + graphH + 18} 8 8 re f\n`;
  pages.push(pageTemplate(title, body, pageNo++));

  const pageCount = pages.length;
  const catalogId = 1;
  const pagesId = 2;
  const firstPageId = 3;
  const font1Id = firstPageId + pageCount;
  const font2Id = font1Id + 1;
  const firstContentId = font2Id + 1;

  const objects: string[] = [
    `${catalogId} 0 obj << /Type /Catalog /Pages ${pagesId} 0 R >> endobj`,
    `${pagesId} 0 obj << /Type /Pages /Kids [${pages.map((_, i) => `${firstPageId + i} 0 R`).join(" ")}] /Count ${pageCount} >> endobj`,
  ];

  pages.forEach((_, i) => {
    const pageObjId = firstPageId + i;
    const contentObjId = firstContentId + i;
    objects.push(`${pageObjId} 0 obj << /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 ${font1Id} 0 R /F2 ${font2Id} 0 R >> >> /Contents ${contentObjId} 0 R >> endobj`);
  });

  objects.push(`${font1Id} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj`);
  objects.push(`${font2Id} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj`);

  pages.forEach((content, i) => {
    const contentObjId = firstContentId + i;
    objects.push(`${contentObjId} 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj`);
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj) => { offsets.push(pdf.length); pdf += obj + "\n"; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((off) => { pdf += `${String(off).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer << /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;

  const safe = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  downloadBlob(safe, new Blob([pdf], { type: "application/pdf" }));
  toast.success(`PDF generado: ${safe}`);
}

async function printExecutiveReport(rows: ReportRow[], title: string, subtitle: string) {
  if (!rows.length) { toast.error("No hay filas para generar PDF."); return; }

  const generated = new Date().toLocaleString("es-ES");
  const hash = `GMT-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.abs(title.split("").reduce((a, c) => a + c.charCodeAt(0), 0))}`;
  const employeeNames = Array.from(new Set(rows.map((r) => r.employee)));
  const isPerson = employeeNames.length === 1;
  const employeeTitle = isPerson ? employeeNames[0] : "Reporte general";
  const safeWho = employeeTitle.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const safePeriod = subtitle.replace(/\s+a\s+/g, "_a_").replace(/[^0-9a-zA-Z_-]+/g, "_").replace(/^_|_$/g, "");
  const filename = `${isPerson ? "informe_horas_marcaciones" : "informe_general_horas_marcaciones"}_${safeWho}_${safePeriod}_${hash}.pdf`;

  const P_W = 1240, P_H = 1754, P_PDF_W = 595, P_PDF_H = 842;
  const L_W = 1754, L_H = 1240, L_PDF_W = 842, L_PDF_H = 595;
  const CX = 96, CY = 72, CW = 1092, BOTTOM = 1624;
  const LCX = 78, LCY = 64, LCW = 1600, LBOTTOM = 1126;
  const FONT = "Arial, Helvetica, sans-serif";

  const blue = "#D9EEF6";
  const green = "#C6E0B4";
  const yellow = "#FFF2CC";
  const paleYellow = "#FFF8D8";
  const red = "#F8DADA";
  const border = "#BFBFBF";

  type PdfPageImage = { svg: string; w: number; h: number; pdfW: number; pdfH: number };

  const escSvg = (value: unknown) => String(value ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));

  const trunc = (value: unknown, n = 28) => {
    const s = escSvg(value);
    return s.length > n ? `${s.slice(0, Math.max(0, n - 1))}…` : s;
  };

  const svgText = (x: number, y: number, value: unknown, size = 18, weight = 400, color = "#000", anchor = "start", italic = false) =>
    `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}"${italic ? ' font-style="italic"' : ""}>${escSvg(value)}</text>`;

  const svgRect = (x: number, y: number, w: number, h: number, fill = "#fff", stroke = border, sw = 1) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;

  function expectedMinutes(row: ReportRow) {
    const a = minutesOf(row.expectedEntry);
    const b = minutesOf(row.expectedExit);
    if (a === null || b === null || b < a) return 0;
    return b - a;
  }
  function sumExpected(items: ReportRow[]) { return items.reduce((sum, r) => sum + expectedMinutes(r), 0); }
  function sumWorked(items: ReportRow[]) { return items.reduce((sum, r) => sum + (r.workedMinutes ?? 0), 0); }
  function fmtSigned(value: number) { return `${value > 0 ? "+" : value < 0 ? "-" : ""}${fmtMinutes(Math.abs(value))}`; }

  function kpi(items: ReportRow[]) {
    const base = buildExecutiveKpis(items);
    const entries = items.filter((r) => !!r.entry).length;
    const exits = items.filter((r) => !!r.exit).length;
    const expected = sumExpected(items);
    const worked = sumWorked(items);
    const balance = worked - expected;
    const lateMinutes = items.reduce((sum, r) => sum + (r.lateMinutes || 0), 0);
    const incomplete = items.filter((r) => r.entry && !r.exit).length;
    return { ...base, entries, exits, expected, worked, balance, lateMinutes, incomplete };
  }

  const total = kpi(rows);
  const byDate = rows.reduce<Record<string, ReportRow[]>>((acc, r) => { (acc[r.date] ||= []).push(r); return acc; }, {});
  const byEmployee = rows.reduce<Record<string, ReportRow[]>>((acc, r) => { (acc[r.employee] ||= []).push(r); return acc; }, {});
  const dateRows = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b));

  let current = "";
  let y = CY;
  const pages: PdfPageImage[] = [];

  function pageWrapPortrait(body: string, pageNo: number) {
    const side = `${employeeTitle} · ${subtitle} · ${hash}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${P_W}" height="${P_H}" viewBox="0 0 ${P_W} ${P_H}">
      <rect width="${P_W}" height="${P_H}" fill="#FFFFFF"/>
      <text x="30" y="1510" transform="rotate(-90 30 1510)" font-family="${FONT}" font-size="12" fill="#777777">${escSvg(side)}</text>
      ${body}
      <text x="${CX}" y="${P_H - 40}" font-family="${FONT}" font-size="13" fill="#555555">${escSvg(`${employeeTitle} · ${subtitle} · ${generated} · ${hash}`)}</text>
      <text x="${P_W - 72}" y="${P_H - 40}" font-family="${FONT}" font-size="13" fill="#555555" text-anchor="end">${pageNo}</text>
    </svg>`;
    return { svg, w: P_W, h: P_H, pdfW: P_PDF_W, pdfH: P_PDF_H };
  }

  function pageWrapLandscape(body: string, pageNo: number) {
    const side = `${employeeTitle} · ${subtitle} · ${hash}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${L_W}" height="${L_H}" viewBox="0 0 ${L_W} ${L_H}">
      <rect width="${L_W}" height="${L_H}" fill="#FFFFFF"/>
      <text x="28" y="1076" transform="rotate(-90 28 1076)" font-family="${FONT}" font-size="12" fill="#777777">${escSvg(side)}</text>
      ${body}
      <text x="${LCX}" y="${L_H - 34}" font-family="${FONT}" font-size="13" fill="#555555">${escSvg(`${employeeTitle} · ${subtitle} · ${generated} · ${hash}`)}</text>
      <text x="${L_W - 68}" y="${L_H - 34}" font-family="${FONT}" font-size="13" fill="#555555" text-anchor="end">${pageNo}</text>
    </svg>`;
    return { svg, w: L_W, h: L_H, pdfW: L_PDF_W, pdfH: L_PDF_H };
  }

  function newPage() {
    if (current.trim()) pages.push(pageWrapPortrait(current, pages.length + 1));
    current = "";
    y = CY;
  }

  function ensure(space: number) {
    if (y + space > BOTTOM) newPage();
  }

  function addSection(titleText: string, note?: string) {
    ensure(note ? 96 : 72);
    y += y === CY ? 0 : 26;
    current += svgText(CX, y, titleText, 26, 700);
    y += 34;
    if (note) {
      current += svgText(CX, y, note, 15, 400, "#555555", "start", true);
      y += 34;
    } else {
      y += 16;
    }
  }

  function addConfidentialBox() {
    ensure(196);
    const h = 168;
    current += svgRect(CX, y, CW, h, paleYellow, "#A99B58", 1.3);
    current += svgText(CX + 18, y + 32, "INFORMACIÓN CONFIDENCIAL.", 17, 500);
    const lines = [
      "Queda prohibido reproducir, transmitir o almacenar fuera del entorno autorizado de GrupMar Time.",
      `Descarga registrada en GrupMar Time con fecha ${generated} y hash ${hash}.`,
      "Está prohibida la difusión de la presente información a terceros ajenos a la organización.",
      "Documento de uso interno para administración, coordinación y jefaturas autorizadas.",
    ];
    lines.forEach((line, i) => current += svgText(CX + 18, y + 62 + i * 24, line, 15, 400));
    y += h + 54;
  }

  function addKeyValueTable(rowsKV: { label: string; value: string; strong?: boolean }[], labelW = 330) {
    const rowH = 34;
    ensure(rowsKV.length * rowH + 22);
    rowsKV.forEach((r) => {
      current += svgRect(CX, y, labelW, rowH, blue);
      current += svgRect(CX + labelW, y, CW - labelW, rowH, "#fff");
      current += svgText(CX + 14, y + 23, r.label, 16, 600);
      current += svgText(CX + labelW + 14, y + 23, r.value, 16, r.strong ? 600 : 400);
      y += rowH;
    });
    y += 34;
  }

  function addTable(widths: number[], headers: string[], bodyRows: { cells: string[]; fill?: string; bold?: boolean; small?: boolean }[], rowH = 30) {
    const headerH = rowH;
    let remaining = [...bodyRows];
    while (remaining.length) {
      ensure(headerH + rowH + 30);
      const canFit = Math.max(1, Math.floor((BOTTOM - y - headerH - 30) / rowH));
      const chunk = remaining.splice(0, canFit);
      let x = CX;
      headers.forEach((h, i) => {
        current += svgRect(x, y, widths[i], headerH, blue);
        current += svgText(x + 7, y + 20, h, 13, 600);
        x += widths[i];
      });
      y += headerH;
      chunk.forEach((r) => {
        x = CX;
        r.cells.forEach((c, i) => {
          current += svgRect(x, y, widths[i], rowH, r.fill ?? "#fff");
          const chars = Math.max(5, Math.floor(widths[i] / (r.small ? 8.8 : 8)));
          current += svgText(x + 7, y + 20, trunc(c, chars), r.small ? 11.5 : 13, r.bold ? 600 : 400);
          x += widths[i];
        });
        y += rowH;
      });
      y += 34;
      if (remaining.length) newPage();
    }
  }

  function addNote(text: string, gap = 34) {
    ensure(gap + 10);
    current += svgText(CX, y, text, 14, 400, "#555555", "start", true);
    y += gap;
  }

  function rowFill(r: ReportRow) {
    if (r.status === "review") return red;
    if (r.status === "late") return yellow;
    if (r.status === "absent") return "#EFEFEF";
    return "#fff";
  }

  function addLandscapeDetailPages() {
    if (current.trim()) newPage();

    const headers = ["Fecha", "Trabajador", "Centro", "Depto.", "Turno", "Esper.", "Entrada", "Inicio alm.", "Fin alm.", "Salida", "Horas", "Estado", "Tarde", "IP / Geo"];
    const widths = [66, 180, 130, 130, 135, 70, 74, 88, 88, 74, 76, 100, 62, 327];
    const rowH = 26;
    const headerH = 30;

    const detailRows = rows.map((r) => {
      const ipGeo = `${r.ip !== "—" ? r.ip : ""} ${r.network !== "—" ? r.network : ""}`.trim() || "—";
      return {
        cells: [r.date.slice(5), r.employee, r.center, r.department, r.shift, r.expectedEntry, timeOnly(r.entry) ?? "—", timeOnly(r.lunchStart) ?? "—", timeOnly(r.lunchEnd) ?? "—", timeOnly(r.exit) ?? "—", fmtMinutes(r.workedMinutes), statusText(r.status), r.lateMinutes ? String(r.lateMinutes) : "—", ipGeo],
        fill: rowFill(r),
      };
    });
    detailRows.push({ cells: ["TOTAL", "", "", "", "", "", "", "", "", "", fmtMinutes(sumWorked(rows)), "", "", ""], fill: green });

    let offset = 0;
    let part = 1;
    while (offset < detailRows.length) {
      let ly = LCY;
      let body = "";
      body += svgText(LCX, ly, `5. Detalle de marcaciones${detailRows.length > 32 ? ` (${part})` : ""}`, 28, 700);
      ly += 38;
      body += svgText(LCX, ly, "Hoja horizontal para mostrar todas las columnas sin cortar información.", 15, 400, "#555555", "start", true);
      ly += 34;

      let x = LCX;
      headers.forEach((h, i) => {
        body += svgRect(x, ly, widths[i], headerH, blue);
        body += svgText(x + 7, ly + 20, h, 12, 600);
        x += widths[i];
      });
      ly += headerH;

      const maxRows = Math.max(1, Math.floor((LBOTTOM - ly - 40) / rowH));
      const chunk = detailRows.slice(offset, offset + maxRows);
      chunk.forEach((r) => {
        x = LCX;
        r.cells.forEach((c, i) => {
          body += svgRect(x, ly, widths[i], rowH, r.fill ?? "#fff");
          const chars = Math.max(6, Math.floor(widths[i] / 8.2));
          body += svgText(x + 6, ly + 18, trunc(c, chars), 11.2, r.fill === green ? 600 : 400);
          x += widths[i];
        });
        ly += rowH;
      });

      pages.push(pageWrapLandscape(body, pages.length + 1));
      offset += chunk.length;
      part += 1;
    }

    current = "";
    y = CY;
  }

  // Cabecera LABO-like
  current += svgText(CX, y, "INFORME EJECUTIVO DE HORAS Y MARCACIONES", 33, 700); y += 42;
  current += svgText(CX, y, `${employeeTitle} · ${subtitle}`, 24, 700, "#555555"); y += 30;
  current += svgText(CX, y, `motor asistencia v12.5 · ${hash}`, 16, 400, "#777777", "start", true); y += 48;
  addConfidentialBox();

  addSection("1. Identificación");
  addKeyValueTable([
    { label: "Tipo de reporte", value: isPerson ? "Por persona" : "General" },
    { label: "Trabajador", value: isPerson ? employeeTitle : "Todos los trabajadores filtrados", strong: true },
    { label: "Centro", value: isPerson ? rows[0]?.center ?? "—" : "Varios" },
    { label: "Departamento", value: isPerson ? rows[0]?.department ?? "—" : "Varios" },
    { label: "Turno predominante", value: rows.find((r) => r.shift !== "—")?.shift ?? "—" },
    { label: "Periodo", value: subtitle },
    { label: "Generado", value: generated },
    { label: "Fuente", value: "Supabase / GrupMar Time / Geo-IP" },
  ]);

  addSection("2. Resumen ejecutivo");
  addTable([76, 82, 74, 64, 80, 70, 80, 116, 116, 116, 82],
    ["Reg.", "Entr.", "Sal.", "OK", "Tarde", "Aus.", "Pend.", "Prev.", "Trab.", "Dif.", "%"],
    [{ cells: [String(total.total), String(total.entries), String(total.exits), String(total.ok), String(total.late), String(total.absent), String(total.pending), fmtMinutes(total.expected), fmtMinutes(total.worked), fmtSigned(total.balance), `${total.punctuality}%`], fill: green, bold: true }],
    34);

  addSection("3. Balance por trabajador");
  const empRows = Object.entries(byEmployee).map(([employee, items]) => {
    const kk = kpi(items);
    return {
      cells: [employee, items[0]?.center ?? "—", String(kk.total), String(kk.entries), String(kk.exits), String(kk.ok), String(kk.late), fmtMinutes(kk.expected), fmtMinutes(kk.worked), fmtSigned(kk.balance), kk.late ? "Revisar" : kk.pending || kk.incomplete ? "Completar" : "Correcto"],
      fill: kk.late ? yellow : kk.absent ? red : "#fff",
      small: true,
    };
  });
  addTable([186, 132, 54, 60, 54, 54, 66, 92, 92, 92, 128],
    ["Trabajador", "Centro", "Reg.", "Entr.", "Sal.", "OK", "Tarde", "Prev.", "Trab.", "Dif.", "Resultado"],
    empRows.length ? empRows : [{ cells: ["Sin datos"], fill: "#fff" }],
    30);

  addSection("4. Calendario de horas y marcaciones");
  const calRows = dateRows.map(([date, items]) => {
    const item = items[0];
    const kk = kpi(items);
    const type = item?.shift && item.shift !== "—" ? "Trabajo" : "Sin turno";
    const state = kk.late ? "Tardanza" : kk.pending ? "Pendiente" : kk.ok ? "A tiempo" : "Correcto";
    return {
      cells: [date.slice(5), prettyDate(date), type, item?.shift ?? "—", item?.expectedEntry ?? "—", timeOnly(item?.entry) ?? "—", timeOnly(item?.lunchStart) ?? "—", timeOnly(item?.lunchEnd) ?? "—", timeOnly(item?.exit) ?? "—", fmtMinutes(kk.expected), fmtMinutes(kk.worked), state, fmtSigned(kk.balance)],
      fill: kk.late ? yellow : type === "Sin turno" ? "#EFEFEF" : "#fff",
      small: true,
    };
  });
  calRows.push({ cells: ["TOTAL", "", "", "", "", "", "", "", "", fmtMinutes(total.expected), fmtMinutes(total.worked), `Tarde ${total.late}`, fmtSigned(total.balance)], fill: green, bold: true, small: true });
  addTable([62, 86, 74, 112, 64, 72, 68, 68, 70, 80, 80, 90, 108],
    ["Fecha", "Día", "Tipo", "Turno", "Esp.", "Entrada", "Ini alm.", "Fin alm.", "Salida", "Prev.", "Trab.", "Estado", "Balance"],
    calRows,
    28);
  addNote("TOTAL resume horas previstas, trabajadas, diferencia, tardanzas y pendientes del periodo.");

  addLandscapeDetailPages();

  addSection("6. Resumen semanal de horas", "Compara horas planificadas contra horas marcadas. La diferencia negativa indica horas pendientes de completar o jornadas sin cierre.");
  const days = dateRows.slice(0, 7);
  const dayHeaders = ["Concepto", ...days.map(([d]) => prettyDate(d).split(",")[0]), "Total"];
  const dayWidths = [220, 94, 94, 94, 94, 94, 94, 94, 214];
  const metrics = [
    ["Horas planificadas", ...days.map(([_, items]) => fmtMinutes(sumExpected(items))), fmtMinutes(total.expected)],
    ["Horas marcadas", ...days.map(([_, items]) => fmtMinutes(sumWorked(items))), fmtMinutes(total.worked)],
    ["Diferencia", ...days.map(([_, items]) => fmtSigned(sumWorked(items) - sumExpected(items))), fmtSigned(total.balance)],
    ["Tardanzas", ...days.map(([_, items]) => String(kpi(items).late)), String(total.late)],
    ["Pendientes de cierre", ...days.map(([_, items]) => String(kpi(items).pending)), String(total.pending)],
    ["Ausencias", ...days.map(([_, items]) => String(kpi(items).absent)), String(total.absent)],
    ["% puntualidad", ...days.map(([_, items]) => `${kpi(items).punctuality}%`), `${total.punctuality}%`],
  ].map((cells, i) => ({ cells, fill: i === 6 ? green : "#fff", bold: i === 6 }));
  addTable(dayWidths, dayHeaders, metrics, 32);

  addSection("7. Control de ubicación y evidencias");
  const geoRows = rows.filter((r) => r.ip !== "—" || r.network !== "—" || r.gps !== "—");
  const geoK = {
    validated: rows.filter((r) => r.network === "Oficina validada" || r.network === "company_network").length,
    review: rows.filter((r) => r.network === "Revisión" || r.status === "review" || r.network === "outside_company_network").length,
    without: rows.filter((r) => r.ip === "—" && r.gps === "—").length,
  };
  addTable([236, 236, 270, 350], ["Validadas", "Revisión", "Sin ubicación", "Total filas"], [{ cells: [String(geoK.validated), String(geoK.review), String(geoK.without), String(rows.length)], fill: green, bold: true }], 32);
  addNote("Detalle de evidencias Geo-IP");
  const geoTableRows = geoRows.map((r) => {
    const risk = r.network === "Oficina validada" || r.network === "company_network" ? "Bajo" : r.network === "—" ? "Sin dato" : "Revisión";
    const obs = r.network === "company_network" ? "Red empresa" : r.network === "outside_company_network" ? "Fuera oficina" : r.network;
    return { cells: [r.date.slice(5), r.employee, "Entrada", timeOnly(r.entry) ?? "—", r.ip, r.gps, risk, obs], fill: risk === "Revisión" ? yellow : "#fff", small: true };
  });
  addTable([68, 154, 84, 72, 146, 154, 84, 330], ["Fecha", "Trabajador", "Evento", "Hora", "IP", "Ubicación", "Riesgo", "Observación"], geoTableRows.length ? geoTableRows : [{ cells: ["Sin evidencias IP/GPS en el rango filtrado."], fill: "#fff" }], 28);

  addSection("8. Resumen visual del periodo", "Lectura ejecutiva del rango filtrado. Se prioriza claridad: totales arriba, detalle diario con separaciones finas y lectura final sencilla.");
  ensure(760);
  const visualDays = dateRows.slice(0, 7).map(([date, items]) => ({ date, ...kpi(items) }));
  const cardsX = CX;
  const cardsY = y;
  const cardsGap = 18;
  const cardsW = (CW - cardsGap * 3) / 4;
  const cardH = 92;
  const cards = [
    { title: "A tiempo", value: String(total.ok), note: `${total.punctuality}% puntualidad`, fill: "#EDF8F2", stroke: "#B6DEC8", color: "#146C43" },
    { title: "Tardanzas", value: String(total.late), note: `${fmtMinutes(total.lateMinutes)} acumulados`, fill: "#FDEEEE", stroke: "#E9C1C1", color: "#B42318" },
    { title: "Pendientes", value: String(total.pending), note: `${total.incomplete} sin salida`, fill: "#F3F4F6", stroke: "#D5D7DA", color: "#555555" },
    { title: "Balance", value: fmtSigned(total.balance), note: `Plan ${fmtMinutes(total.expected)} · Real ${fmtMinutes(total.worked)}`, fill: "#EEF5FB", stroke: "#C8D9EA", color: "#245B8A" },
  ];
  cards.forEach((card, idx) => {
    const x = cardsX + idx * (cardsW + cardsGap);
    current += svgRect(x, cardsY, cardsW, cardH, card.fill, card.stroke, 1);
    current += svgText(x + 18, cardsY + 28, card.title, 14, 600, "#5B6470");
    current += svgText(x + 18, cardsY + 58, card.value, 28, 700, card.color);
    current += svgText(x + 18, cardsY + 78, card.note, 12.5, 400, "#6B7280");
  });
  y += cardH + 30;

  const tableX = CX;
  const tableY = y;
  const tableW = CW;
  const headerH = 38;
  const vRowH = 46;
  const colDay = 236;
  const colScore = 180;
  const colLate = 150;
  const colPend = 160;
  const colRead = tableW - colDay - colScore - colLate - colPend;
  const tableH = headerH + visualDays.length * vRowH + 14;
  current += svgRect(tableX, tableY, tableW, tableH, "#FFFFFF", "#D8E0E8", 1);
  current += svgRect(tableX, tableY, tableW, headerH, "#EAF3F8", "#D8E0E8", 1);
  const v1 = tableX + colDay;
  const v2 = v1 + colScore;
  const v3 = v2 + colLate;
  const v4 = v3 + colPend;
  current += `<line x1="${v1}" y1="${tableY}" x2="${v1}" y2="${tableY + tableH}" stroke="#D0D7DE" stroke-width="1" stroke-dasharray="1 4"/>`;
  current += `<line x1="${v2}" y1="${tableY}" x2="${v2}" y2="${tableY + tableH}" stroke="#D0D7DE" stroke-width="1" stroke-dasharray="1 4"/>`;
  current += `<line x1="${v3}" y1="${tableY}" x2="${v3}" y2="${tableY + tableH}" stroke="#D0D7DE" stroke-width="1" stroke-dasharray="1 4"/>`;
  current += `<line x1="${v4}" y1="${tableY}" x2="${v4}" y2="${tableY + tableH}" stroke="#D0D7DE" stroke-width="1" stroke-dasharray="1 4"/>`;
  current += svgText(tableX + 16, tableY + 25, "Día", 14, 600, "#3F4954");
  current += svgText(v1 + 16, tableY + 25, "Puntualidad", 14, 600, "#3F4954");
  current += svgText(v2 + 16, tableY + 25, "Tardanzas", 14, 600, "#3F4954");
  current += svgText(v3 + 16, tableY + 25, "Pendientes", 14, 600, "#3F4954");
  current += svgText(v4 + 16, tableY + 25, "Lectura ejecutiva", 14, 600, "#3F4954");

  visualDays.forEach((d, i) => {
    const yy = tableY + headerH + i * vRowH;
    current += svgRect(tableX, yy, tableW, vRowH, i % 2 === 0 ? "#FFFFFF" : "#FAFBFC", "#E5E7EB", 0.6);
    current += `<line x1="${tableX}" y1="${yy}" x2="${tableX + tableW}" y2="${yy}" stroke="#E2E8F0" stroke-width="1" stroke-dasharray="1 4"/>`;
    current += svgText(tableX + 14, yy + 19, d.date.slice(5), 12.5, 600, "#111827");
    current += svgText(tableX + 74, yy + 19, prettyDate(d.date), 13, 400, "#374151");

    const punctualBaseX = v1 + 16;
    const punctualBaseY = yy + 16;
    const punctualW = 108;
    const dayTotal = Math.max(1, d.total || d.ok + d.late + d.pending + d.absent);
    const punctualFill = Math.round((d.ok / dayTotal) * punctualW);
    current += svgRect(punctualBaseX, punctualBaseY, punctualW, 14, "#E5E7EB", "#E5E7EB", 0);
    if (punctualFill > 0) current += svgRect(punctualBaseX, punctualBaseY, punctualFill, 14, "#198754", "#198754", 0);
    current += svgText(punctualBaseX + punctualW + 12, yy + 27, `${d.ok} / ${dayTotal}`, 12.5, 600, "#146C43");

    const lateText = d.late ? `${d.late} reg. · ${fmtMinutes(d.lateMinutes)}` : "Sin tardanzas";
    current += svgText(v2 + 16, yy + 19, lateText, 12.5, d.late ? 600 : 400, d.late ? "#B42318" : "#6B7280");

    const pendText = d.pending ? `${d.pending} por cerrar` : "Sin pendientes";
    current += svgText(v3 + 16, yy + 19, pendText, 12.5, d.pending ? 600 : 400, d.pending ? "#4B5563" : "#6B7280");

    const read = d.late ? "Revisar tardanza" : d.pending ? "Pendiente de cierre" : d.ok ? "Correcto" : "Sin actividad";
    const readColor = d.late ? "#B42318" : d.pending ? "#555555" : "#146C43";
    const readFill = d.late ? "#FDEEEE" : d.pending ? "#F3F4F6" : "#EDF8F2";
    const readStroke = d.late ? "#E9C1C1" : d.pending ? "#D5D7DA" : "#B6DEC8";
    current += svgRect(v4 + 16, yy + 11, 170, 22, readFill, readStroke, 1);
    current += svgText(v4 + 101, yy + 26, read, 12.5, 600, readColor, "middle");
  });
  y += tableH + 34;

  addTable([244, 100, 104, 114, 132, 132, 144, 90], ["Periodo", "A tiempo", "Tardanzas", "Pendientes", "Planificadas", "Marcadas", "Diferencia", "%"], [{ cells: [subtitle, String(total.ok), String(total.late), String(total.pending), fmtMinutes(total.expected), fmtMinutes(total.worked), fmtSigned(total.balance), `${total.punctuality}%`], fill: green, bold: true }], 30);
  const observation = isPerson ? `Resumen: ${total.ok} registros a tiempo, ${total.late} tardanzas, ${total.pending} pendientes y un balance de ${fmtSigned(total.balance)}.` : `Resumen del periodo: ${total.ok} registros a tiempo, ${total.late} tardanzas, ${total.pending} pendientes y un balance global de ${fmtSigned(total.balance)}.`;
  addNote(observation, 30);

  if (current.trim()) pages.push(pageWrapPortrait(current, pages.length + 1));

  async function svgToJpegBytes(page: PdfPageImage) {
    const blob = new Blob([page.svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      const loaded = new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("No se pudo renderizar la página SVG del PDF."));
      });
      img.src = url;
      await loaded;
      const canvas = document.createElement("canvas");
      canvas.width = page.w;
      canvas.height = page.h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No se pudo crear el canvas del PDF.");
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, page.w, page.h);
      ctx.drawImage(img, 0, 0, page.w, page.h);
      const jpgBlob: Blob = await new Promise((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error("No se pudo convertir la página a JPG.")), "image/jpeg", 0.94));
      return new Uint8Array(await jpgBlob.arrayBuffer());
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function asciiBytes(s: string) { return new TextEncoder().encode(s); }
  function concatPdfBytes(parts: Uint8Array[]) {
    const total = parts.reduce((sum, p) => sum + p.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    parts.forEach((p) => { out.set(p, offset); offset += p.length; });
    return out;
  }
  function buildImagePdf(pageDefs: PdfPageImage[], images: Uint8Array[]) {
    const pageCount = images.length;
    const objects: { id: number; bytes: Uint8Array }[] = [];
    const catalogId = 1, pagesId = 2, firstPageId = 3;
    const firstImageId = firstPageId + pageCount;
    const firstContentId = firstImageId + pageCount;
    objects.push({ id: catalogId, bytes: asciiBytes(`${catalogId} 0 obj << /Type /Catalog /Pages ${pagesId} 0 R >> endobj\n`) });
    objects.push({ id: pagesId, bytes: asciiBytes(`${pagesId} 0 obj << /Type /Pages /Kids [${images.map((_, i) => `${firstPageId + i} 0 R`).join(" ")}] /Count ${pageCount} >> endobj\n`) });
    images.forEach((_, i) => {
      const pageId = firstPageId + i, imageId = firstImageId + i, contentId = firstContentId + i;
      const p = pageDefs[i];
      objects.push({ id: pageId, bytes: asciiBytes(`${pageId} 0 obj << /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${p.pdfW} ${p.pdfH}] /Resources << /XObject << /Im${i + 1} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >> endobj\n`) });
    });
    images.forEach((img, i) => {
      const imageId = firstImageId + i;
      const p = pageDefs[i];
      const head = asciiBytes(`${imageId} 0 obj << /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >> stream\n`);
      const tail = asciiBytes("\nendstream endobj\n");
      objects.push({ id: imageId, bytes: concatPdfBytes([head, img, tail]) });
    });
    images.forEach((_, i) => {
      const contentId = firstContentId + i;
      const p = pageDefs[i];
      const content = `q ${p.pdfW} 0 0 ${p.pdfH} 0 0 cm /Im${i + 1} Do Q`;
      objects.push({ id: contentId, bytes: asciiBytes(`${contentId} 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj\n`) });
    });
    objects.sort((a, b) => a.id - b.id);
    const parts: Uint8Array[] = [asciiBytes("%PDF-1.4\n")];
    const offsets: number[] = [0];
    let pos = parts[0].length;
    objects.forEach((obj) => { offsets[obj.id] = pos; parts.push(obj.bytes); pos += obj.bytes.length; });
    const xrefStart = pos;
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objects.length; i++) xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    xref += `trailer << /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
    parts.push(asciiBytes(xref));
    return concatPdfBytes(parts);
  }

  try {
    toast.info("Generando PDF profesional...");
    const images = [];
    for (const page of pages) images.push(await svgToJpegBytes(page));
    const pdf = buildImagePdf(pages, images);
    downloadBlob(filename, new Blob([pdf], { type: "application/pdf" }));
    toast.success(`PDF descargado: ${filename}`);
  } catch (error: any) {
    console.error(error);
    toast.error(error?.message ?? "No se pudo generar el PDF.");
  }
}
function TrendChart({ rows }: { rows: ReportRow[] }) {
  const data = useMemo(() => {
    const byDate = rows.reduce<Record<string, { ok: number; late: number; pending: number }>>((acc, r) => {
      const v = (acc[r.date] ||= { ok: 0, late: 0, pending: 0 });
      if (r.status === "ok") v.ok++;
      if (r.status === "late") v.late++;
      if (r.status === "pending") v.pending++;
      return acc;
    }, {});
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7)
      .map(([date, v]) => ({ date, ...v, total: Math.max(1, v.ok + v.late + v.pending) }));
  }, [rows]);

  const totals = data.reduce((acc, d) => ({ ok: acc.ok + d.ok, late: acc.late + d.late, pending: acc.pending + d.pending }), { ok: 0, late: 0, pending: 0 });

  if (!data.length) {
    return <div className="rounded-2xl border border-dashed bg-slate-50 p-4 text-sm text-slate-500">Sin datos para graficar en el rango seleccionado.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2">
          <div className="text-[11px] font-semibold text-emerald-700">A tiempo</div>
          <div className="text-xl font-black text-emerald-800">{totals.ok}</div>
        </div>
        <div className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2">
          <div className="text-[11px] font-semibold text-rose-700">Tardanzas</div>
          <div className="text-xl font-black text-rose-800">{totals.late}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[11px] font-semibold text-slate-600">Pendientes</div>
          <div className="text-xl font-black text-slate-700">{totals.pending}</div>
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="mb-2 grid grid-cols-[92px_1fr_72px] gap-3 text-[11px] font-black uppercase tracking-wide text-slate-500">
          <span>Día</span><span>Distribución</span><span>Lectura</span>
        </div>
        <div className="space-y-2">
          {data.map((d) => {
            const okPct = Math.round((d.ok / d.total) * 100);
            const latePct = Math.round((d.late / d.total) * 100);
            const pendingPct = Math.max(0, 100 - okPct - latePct);
            const label = d.late ? "Revisar" : d.pending ? "Pendiente" : "Correcto";
            const labelClass = d.late ? "bg-rose-50 text-rose-700 border-rose-200" : d.pending ? "bg-slate-50 text-slate-600 border-slate-200" : "bg-emerald-50 text-emerald-700 border-emerald-200";
            return (
              <div key={d.date} className="grid grid-cols-[92px_1fr_72px] items-center gap-3 rounded-xl border border-slate-100 px-2 py-1.5">
                <div className="text-xs font-bold text-slate-700">{d.date.slice(5)}</div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100 flex">
                  <div className="bg-emerald-600" style={{ width: `${okPct}%` }} />
                  <div className="bg-rose-600" style={{ width: `${latePct}%` }} />
                  <div className="bg-slate-400" style={{ width: `${pendingPct}%` }} />
                </div>
                <div className={`rounded-full border px-2 py-1 text-center text-[10px] font-black ${labelClass}`}>{label}</div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-semibold text-slate-600">
          <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-emerald-600" /> A tiempo</span>
          <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-rose-600" /> Tardanza</span>
          <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-slate-400" /> Pendiente</span>
        </div>
      </div>
    </div>
  );
}

function AttendancePage() {
  const today = ymd();
  const [dateFrom, setDateFrom] = useState(() => mondayOf(today));
  const [dateTo, setDateTo] = useState(() => addDays(mondayOf(today), 6));
  const [selectedDate, setSelectedDate] = useState(today);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ReportRow["status"]>("all");
  const [reportMode, setReportMode] = useState<ReportMode>("general");
  const [periodMode, setPeriodMode] = useState<PeriodMode>("week");
  const [selectedEmployee, setSelectedEmployee] = useState("all");
  const [dailyRows, setDailyRows] = useState<DailyRow[]>([]);
  const [accessRows, setAccessRows] = useState<AccessSnapshot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [moduleOrder, setModuleOrder] = useState<AdminModuleId[]>(() => readAdminModuleOrder());
  const [visibleModules, setVisibleModules] = useState<AdminModuleId[]>(() => readAdminVisibleModules());
  const [showModulePicker, setShowModulePicker] = useState(false);
  const [draggedModule, setDraggedModule] = useState<AdminModuleId | null>(null);
  const [mapInteractionEnabled, setMapInteractionEnabled] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("v_daily_attendance_admin")
        .select("*")
        .gte("attendance_date", dateFrom)
        .lte("attendance_date", dateTo)
        .order("attendance_date", { ascending: false })
        .order("full_name", { ascending: true });

      if (error) {
        console.error(error);
        toast.error("No se pudo leer v_daily_attendance_admin. Revisa la vista/RLS en Supabase.");
      }
      setDailyRows((data ?? []) as DailyRow[]);

      const local = readAccessSnapshots().filter((r) => {
        const d = r.created_at.slice(0, 10);
        return d >= dateFrom && d <= dateTo;
      });
      setAccessRows(local);
      if (!selectedId && local[0]) setSelectedId(local[0].id);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [dateFrom, dateTo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const down = (ev: KeyboardEvent) => setMapInteractionEnabled(ev.ctrlKey || ev.metaKey);
    const up = () => setMapInteractionEnabled(false);
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", up); };
  }, []);

  function persistModuleOrder(next: AdminModuleId[]) { setModuleOrder(next); saveAdminModuleOrder(next); }
  function persistVisibleModules(next: AdminModuleId[]) {
    setVisibleModules(next);
    saveAdminVisibleModules(next);
  }
  function toggleVisibleModule(id: AdminModuleId) {
    const exists = visibleModules.includes(id);
    const next = exists ? visibleModules.filter((m) => m !== id) : [...visibleModules, id];
    persistVisibleModules(next);
  }

  function moduleRank(id: AdminModuleId) { const idx = moduleOrder.indexOf(id); return idx >= 0 ? idx : DEFAULT_ADMIN_MODULE_ORDER.indexOf(id); }
  function moveModule(id: AdminModuleId, direction: -1 | 1) {
    const current = [...moduleOrder]; const idx = current.indexOf(id); if (idx < 0) return;
    const nextIdx = Math.max(0, Math.min(current.length - 1, idx + direction)); if (nextIdx === idx) return;
    const [item] = current.splice(idx, 1); current.splice(nextIdx, 0, item); persistModuleOrder(current);
  }
  function dropModule(target: AdminModuleId) {
    if (!draggedModule || draggedModule === target) return;
    const current = [...moduleOrder]; const from = current.indexOf(draggedModule); const to = current.indexOf(target); if (from < 0 || to < 0) return;
    const [item] = current.splice(from, 1); current.splice(to, 0, item); persistModuleOrder(current); setDraggedModule(null);
  }
  const ModuleFrame = ({ id, children }: { id: AdminModuleId; children: any }) => {
    if (!visibleModules.includes(id)) return null;
    return (
    <section draggable onDragStart={() => setDraggedModule(id)} onDragEnd={() => setDraggedModule(null)} onDragOver={(e) => e.preventDefault()} onDrop={() => dropModule(id)} style={{ order: moduleRank(id) }} className={`rounded-[1.8rem] transition ${draggedModule === id ? "scale-[.99] opacity-60" : ""}`}>
      <div className="mb-2 flex items-center justify-between rounded-2xl border border-slate-200 bg-white/85 px-3 py-2 text-xs shadow-sm backdrop-blur">
        <div className="flex items-center gap-2 font-black text-slate-700"><span className="cursor-grab rounded-lg bg-slate-100 px-2 py-1 text-slate-500 active:cursor-grabbing"><GripVertical className="h-3.5 w-3.5" /></span><span>{ADMIN_MODULE_LABELS[id]}</span></div>
        <div className="flex items-center gap-1"><button type="button" className="rounded-lg border bg-white px-2 py-1 font-black text-slate-600" onClick={() => moveModule(id, -1)}>↑</button><button type="button" className="rounded-lg border bg-white px-2 py-1 font-black text-slate-600" onClick={() => moveModule(id, 1)}>↓</button></div>
      </div>{children}
    </section>
    );
  };

  const employees = useMemo<Employee[]>(() => {
    const byId = new Map<string, Employee>();

    for (const row of dailyRows) {
      if (!row.employee_id) continue;
      byId.set(row.employee_id, {
        id: row.employee_id,
        full_name: row.full_name || "Trabajador sin nombre",
        email: null,
        department: row.department,
        center: row.work_center,
        active: true,
      });
    }

    return Array.from(byId.values()).sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [dailyRows]);

  const selected = useMemo(() => accessRows.find((r) => r.id === selectedId) ?? accessRows[0] ?? null, [accessRows, selectedId]);

  const reportRows = useMemo<ReportRow[]>(() => {
    const shifts: Shift[] = [];
    const plans: Plan[] = [];
    const dates = getDateRange(dateFrom, dateTo);
    const byKey = new Map<string, ReportRow>();

    function ensure(employeeName: string, date: string, employee?: Employee): ReportRow {
      const key = `${date}|${employeeName.toLowerCase()}`;
      const existing = byKey.get(key);
      if (existing) return existing;

      const plan = employee ? plans.find((p) => p.employee_id === employee.id && p.date === date) : undefined;
      const shift = plan ? shifts.find((s) => s.id === plan.shift_id) : undefined;

      const row: ReportRow = {
        id: key,
        date,
        employee: employeeName,
        department: employee?.department ?? "—",
        center: employee?.center ?? "—",
        shift: shift?.name ?? "—",
        expectedEntry: shift?.start_time?.slice(0, 5) ?? "—",
        expectedExit: shift?.end_time?.slice(0, 5) ?? "—",
        entry: null,
        exit: null,
        lunchStart: null,
        lunchEnd: null,
        status: "pending",
        lateMinutes: 0,
        workedMinutes: null,
        ip: "—",
        network: "—",
        gps: "—",
        source: "Local",
      };
      byKey.set(key, row);
      return row;
    }

    for (const employee of employees) {
      for (const date of dates) ensure(employee.full_name, date, employee);
    }

    for (const r of dailyRows) {
      const row = ensure(r.full_name, r.attendance_date, employees.find((e) => e.full_name === r.full_name));
      row.department = r.department ?? row.department;
      row.center = r.work_center ?? row.center;
      row.shift = r.shift ?? row.shift;
      row.expectedEntry = r.expected_entry_time?.slice(0, 5) ?? row.expectedEntry;
      row.entry = r.actual_entry_time ?? row.entry;
      row.ip = r.ip_address ?? row.ip;
      row.network = r.connection_location_status ?? row.network;
      row.lateMinutes = Number(r.late_minutes_after_tolerance ?? 0);
      row.status = r.is_absent ? "absent" : r.has_tardiness ? "late" : r.actual_entry_time ? "ok" : "pending";
      row.source = row.source === "Local" ? "Supabase" : "Mixto";
    }

    const accessByEmployeeDate = accessRows.reduce<Record<string, AccessSnapshot[]>>((acc, r) => {
      const d = r.created_at.slice(0, 10);
      const name = String(r.employee_name ?? "Sin trabajador");
      const key = `${d}|${name.toLowerCase()}`;
      (acc[key] ||= []).push(r);
      return acc;
    }, {});

    Object.entries(accessByEmployeeDate).forEach(([key, items]) => {
      items.sort((a, b) => a.created_at.localeCompare(b.created_at));
      const [date, nameLower] = key.split("|");
      const employee = employees.find((e) => e.full_name.toLowerCase() === nameLower);
      const row = ensure(items[0]?.employee_name ?? "Sin trabajador", date, employee);

      const entry = items.find((x) => x.event_type === "ENTRY" || x.event_type === "ENTRY_LOGIN") ?? items[0];
      const exit = [...items].reverse().find((x) => x.event_type === "EXIT");
      const lunchStart = items.find((x) => x.event_type === "LUNCH_START");
      const lunchEnd = [...items].reverse().find((x) => x.event_type === "LUNCH_END");

      row.entry = row.entry ?? entry?.created_at ?? null;
      row.exit = row.exit ?? exit?.created_at ?? null;
      row.lunchStart = lunchStart?.created_at ?? null;
      row.lunchEnd = lunchEnd?.created_at ?? null;
      row.ip = entry?.ip_address ?? row.ip;
      row.network = entry?.risk_level === "low" ? "Oficina validada" : entry?.risk_level ? "Revisión" : row.network;
      row.gps = entry?.latitude && entry?.longitude ? `${entry.latitude.toFixed(5)}, ${entry.longitude.toFixed(5)}` : row.gps;
      row.source = row.source === "Supabase" ? "Mixto" : "Local";

      const expected = minutesOf(row.expectedEntry);
      const actual = minutesOf(row.entry);
      if (actual !== null && expected !== null && row.status !== "absent") {
        const tolerance = employee ? 10 : 10;
        row.lateMinutes = Math.max(0, actual - expected - tolerance);
        row.status = row.lateMinutes > 0 ? "late" : "ok";
      }
      if (row.entry && row.exit) row.workedMinutes = diffEventMinutes(row.entry, row.exit);
    });

    return [...byKey.values()].sort((a, b) => `${b.date} ${a.employee}`.localeCompare(`${a.date} ${b.employee}`));
  }, [dateFrom, dateTo, dailyRows, accessRows]);

  const filteredRows = useMemo(() => {
    const q = query.toLowerCase().trim();
    return reportRows.filter((r) => {
      if (reportMode === "person" && selectedEmployee !== "all" && r.employee !== selectedEmployee) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return `${r.employee} ${r.department} ${r.center} ${r.shift} ${r.status}`.toLowerCase().includes(q);
    });
  }, [reportRows, query, statusFilter, reportMode, selectedEmployee]);

  const selectedDateRows = useMemo(() => filteredRows.filter((r) => r.date === selectedDate), [filteredRows, selectedDate]);

  const kpis = useMemo(() => buildExecutiveKpis(filteredRows), [filteredRows]);

  const executiveRows = useMemo(() => {
    const grouped = filteredRows.reduce<Record<string, ReportRow[]>>((acc, r) => { (acc[r.employee] ||= []).push(r); return acc; }, {});
    return Object.entries(grouped).map(([employee, rows]) => {
      const kk = buildExecutiveKpis(rows);
      const worked = rows.reduce((sum, r) => sum + (r.workedMinutes ?? 0), 0);
      const lateMins = rows.reduce((sum, r) => sum + (r.lateMinutes ?? 0), 0);
      return { employee, rows: rows.length, ...kk, worked, lateMins };
    }).sort((a, b) => b.late - a.late || a.employee.localeCompare(b.employee));
  }, [filteredRows]);

  const calendarDays = useMemo(() => getDateRange(dateFrom, dateTo).slice(0, 31), [dateFrom, dateTo]);

  function setQuick(mode: "today" | "week" | "month" | "year") {
    setPeriodMode(mode);
    const now = ymd();
    if (mode === "today") { setDateFrom(now); setDateTo(now); setSelectedDate(now); return; }
    if (mode === "week") {
      const monday = mondayOf(now);
      setDateFrom(monday); setDateTo(addDays(monday, 6)); setSelectedDate(now); return;
    }
    if (mode === "year") {
      const first = now.slice(0, 4) + "-01-01";
      const last = now.slice(0, 4) + "-12-31";
      setDateFrom(first); setDateTo(last); setSelectedDate(now); return;
    }
    const first = now.slice(0, 8) + "01";
    const d = new Date(first + "T12:00:00");
    d.setMonth(d.getMonth() + 1);
    d.setDate(0);
    setDateFrom(first); setDateTo(ymd(d)); setSelectedDate(now);
  }

  function filename(ext: "xlsx" | "pdf") {
    const who = reportMode === "person" && selectedEmployee !== "all" ? selectedEmployee.replace(/\s+/g, "_") : "general";
    return `marcaciones_${who}_${dateFrom}_a_${dateTo}.${ext}`;
  }

  return (
    <div className="gmt-page p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <VersionBadge />
          <h1 className="mt-3 text-3xl font-black text-slate-950">Administrador de marcaciones</h1>
          <p className="text-sm text-slate-500">
            Una sola pantalla para revisar calendario, entradas, salidas, tardanzas, ausencias, ubicación y exportar reportes. {ATTENDANCE_ADMIN_VERSION}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Button className="gmt-secondary" onClick={() => persistModuleOrder(DEFAULT_ADMIN_MODULE_ORDER)}>Restaurar módulos</Button>
          <Button className={periodMode === "today" ? "bg-sky-100 text-sky-900 border border-sky-200 hover:bg-sky-200" : "gmt-secondary"} onClick={() => setQuick("today")}>Hoy</Button>
          <Button className={periodMode === "week" ? "bg-sky-100 text-sky-900 border border-sky-200 hover:bg-sky-200" : "gmt-secondary"} onClick={() => setQuick("week")}>Semana</Button>
          <Button className={periodMode === "month" ? "bg-sky-100 text-sky-900 border border-sky-200 hover:bg-sky-200" : "gmt-secondary"} onClick={() => setQuick("month")}>Mes</Button>
          <Button className="gmt-secondary" onClick={() => void load()}><RefreshCw className="w-4 h-4 mr-2" /> Recargar</Button>
        </div>
      </div>

      <Card className="mb-5 rounded-[1.7rem] border-sky-100 bg-sky-50/70 p-3 shadow-sm">
        <button type="button" onClick={() => setShowModulePicker(!showModulePicker)} className="flex w-full items-center justify-between gap-3 text-left">
          <div>
            <div className="text-sm font-black text-slate-800">Personalizar panel de marcaciones</div>
            <div className="text-xs text-slate-500">Elige qué módulos quieres ver. Lo que desmarques no aparecerá en el panel.</div>
          </div>
          <Badge variant="outline" className="border-sky-200 bg-white text-sky-800">{visibleModules.length}/{DEFAULT_ADMIN_MODULE_ORDER.length} visibles</Badge>
        </button>
        {showModulePicker && (
          <div className="mt-3 rounded-2xl border border-sky-100 bg-white p-3">
            <div className="mb-3 flex flex-wrap gap-2">
              <Button size="sm" className="bg-sky-100 text-sky-900 hover:bg-sky-200" onClick={() => persistVisibleModules(DEFAULT_ADMIN_MODULE_ORDER)}>Mostrar todo</Button>
              <Button size="sm" variant="outline" onClick={() => persistVisibleModules([])}>Ocultar todo</Button>
              <Button size="sm" variant="outline" onClick={() => { persistVisibleModules(DEFAULT_ADMIN_MODULE_ORDER); persistModuleOrder(DEFAULT_ADMIN_MODULE_ORDER); }}>Restaurar vista</Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {DEFAULT_ADMIN_MODULE_ORDER.map((id) => (
                <label key={id} className={`flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2 text-sm ${visibleModules.includes(id) ? "border-sky-200 bg-sky-50 text-slate-900" : "border-slate-200 bg-white text-slate-500"}`}>
                  <input type="checkbox" className="h-4 w-4 accent-sky-500" checked={visibleModules.includes(id)} onChange={() => toggleVisibleModule(id)} />
                  <span className="font-semibold">{ADMIN_MODULE_LABELS[id]}</span>
                </label>
              ))}
            </div>
            {visibleModules.length === 0 && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">No hay módulos seleccionados. Usa “Mostrar todo” o marca los módulos que quieras volver a ver.</div>}
          </div>
        )}
      </Card>

      <div className="flex flex-col gap-5">
      <ModuleFrame id="filters">
      <Card className="p-4 rounded-[1.7rem] bg-white/90 shadow-sm">
        <div className="grid gap-3 xl:grid-cols-[150px_170px_170px_170px_220px_1fr_260px] items-end">
          <div>
            <Label>Periodo</Label>
            <select className="gmt-input w-full border-sky-200 bg-sky-50 text-sky-950 focus:border-sky-300 focus:ring-sky-100" value={periodMode} onChange={(e) => e.target.value === "custom" ? setPeriodMode("custom") : setQuick(e.target.value as any)}>
              <option value="today">Día</option><option value="week">Semana</option><option value="month">Mes</option><option value="year">Año</option><option value="custom">Personalizado</option>
            </select>
          </div>
          <div>
            <Label>Desde</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <Label>Hasta</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div>
            <Label>Reporte</Label>
            <select className="gmt-input w-full" value={reportMode} onChange={(e) => setReportMode(e.target.value as ReportMode)}>
              <option value="general">General</option><option value="person">Por persona</option>
            </select>
          </div>
          <div>
            <Label>Trabajador</Label>
            <select className="gmt-input w-full" value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)} disabled={reportMode === "general"}>
              <option value="all">Todos</option>{employees.map((e) => <option key={e.id} value={e.full_name}>{e.full_name}</option>)}
            </select>
          </div>
          <div>
            <Label>Buscar trabajador / centro / turno</Label>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ana, Sant Antoni, Turno Oficina..." />
            </div>
          </div>
          <div>
            <Label>Estado</Label>
            <select className="gmt-input w-full" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
              <option value="all">Todos</option>
              <option value="ok">A tiempo</option>
              <option value="late">Tardanza</option>
              <option value="absent">Ausente</option>
              <option value="pending">Pendiente</option>
              <option value="review">Revisión</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button className="gmt-primary flex-1" onClick={() => exportXlsx(filteredRows, filename("xlsx"), reportMode === "person" && selectedEmployee !== "all" ? `INFORME DE HORAS Y MARCACIONES · ${selectedEmployee}` : "INFORME GENERAL DE HORAS Y MARCACIONES", `${dateFrom} a ${dateTo}`)}>
              <FileSpreadsheet className="w-4 h-4 mr-2" /> XLSX
            </Button>
            <Button className="gmt-secondary flex-1" onClick={() => printExecutiveReport(filteredRows, reportMode === "person" && selectedEmployee !== "all" ? `INFORME DE HORAS Y MARCACIONES · ${selectedEmployee}` : "INFORME GENERAL DE HORAS Y MARCACIONES", `${dateFrom} a ${dateTo}`)}>
              <Printer className="w-4 h-4 mr-2" /> PDF
            </Button>
          </div>
        </div>
      </Card>
      </ModuleFrame>

      <ModuleFrame id="kpis">
      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Card className="p-4 rounded-3xl"><div className="text-xs font-black text-slate-500">Registros</div><div className="text-3xl font-black">{kpis.total}</div><Users className="mt-2 h-5 w-5 text-slate-400" /></Card>
        <Card className="p-4 rounded-3xl bg-emerald-50"><div className="text-xs font-black text-emerald-700">A tiempo</div><div className="text-3xl font-black text-emerald-700">{kpis.ok}</div><CheckCircle2 className="mt-2 h-5 w-5 text-emerald-600" /></Card>
        <Card className="p-4 rounded-3xl bg-rose-50"><div className="text-xs font-black text-rose-700">Tardanzas</div><div className="text-3xl font-black text-rose-700">{kpis.late}</div><AlertTriangle className="mt-2 h-5 w-5 text-rose-600" /></Card>
        <Card className="p-4 rounded-3xl bg-slate-50"><div className="text-xs font-black text-slate-700">Ausentes</div><div className="text-3xl font-black text-slate-700">{kpis.absent}</div><ShieldX className="mt-2 h-5 w-5 text-slate-600" /></Card>
        <Card className="p-4 rounded-3xl bg-sky-50"><div className="text-xs font-black text-sky-700">Pendientes</div><div className="text-3xl font-black text-sky-700">{kpis.pending}</div><Clock className="mt-2 h-5 w-5 text-sky-600" /></Card>
        <Card className="p-4 rounded-3xl bg-amber-50"><div className="text-xs font-black text-amber-700">Geo revisión</div><div className="text-3xl font-black text-amber-700">{kpis.review}</div><MapPin className="mt-2 h-5 w-5 text-amber-600" /></Card>
      </section>
      </ModuleFrame>

      <ModuleFrame id="calendar">
      <Card className="rounded-[1.7rem] bg-white/90 p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-black flex items-center gap-2"><CalendarDays className="w-5 h-5" /> Calendario de marcaciones</h2>
            <p className="text-xs text-slate-500">Pulsa un día para filtrar el detalle inferior.</p>
          </div>
          {loading && <Badge variant="outline">Cargando...</Badge>}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
          {calendarDays.map((d) => {
            const dayRows = filteredRows.filter((r) => r.date === d);
            const late = dayRows.filter((r) => r.status === "late").length;
            const ok = dayRows.filter((r) => r.status === "ok").length;
            const absent = dayRows.filter((r) => r.status === "absent").length;
            const active = d === selectedDate;
            return (
              <button
                key={d}
                onClick={() => setSelectedDate(d)}
                className={`rounded-2xl border p-3 text-left shadow-sm transition hover:-translate-y-0.5 ${active ? "border-sky-300 bg-sky-50 text-slate-900 ring-2 ring-sky-100" : "bg-white hover:bg-sky-50/50"}`}
              >
                <div className="text-sm font-black">{prettyDate(d)}</div>
                <div className="mt-2 grid grid-cols-3 gap-1 text-[11px] font-black">
                  <span className="text-emerald-700">OK {ok}</span>
                  <span className="text-rose-700">Tarde {late}</span>
                  <span className="text-slate-600">Aus {absent}</span>
                </div>
              </button>
            );
          })}
        </div>
      </Card>
      </ModuleFrame>

      <ModuleFrame id="trend">
      <Card className="rounded-[1.7rem] bg-white/90 p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-black text-slate-800">Resumen visual de puntualidad</h2>
            <p className="text-[11px] text-slate-500">Compacto: no ocupa toda la pantalla.</p>
          </div>
          <Badge variant="outline" className="bg-sky-50 text-sky-800 border-sky-200">Últimos 7 días</Badge>
        </div>
        <TrendChart rows={filteredRows} />
      </Card>
      </ModuleFrame>

      <ModuleFrame id="daily">
      <Card className="rounded-[1.7rem] bg-white/90 shadow-sm overflow-hidden">
        <div className="border-b p-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-black">Reporte del día seleccionado: {prettyDate(selectedDate)}</h2>
            <p className="text-xs text-slate-500">Entradas, salidas, tardanzas, estado, IP y ubicación en un solo reporte.</p>
          </div>
          <Badge variant="outline">{selectedDateRows.length} filas</Badge>
        </div>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trabajador</TableHead>
                <TableHead>Centro</TableHead>
                <TableHead>Turno</TableHead>
                <TableHead>Esperada</TableHead>
                <TableHead>Entrada</TableHead>
                <TableHead>Salida</TableHead>
                <TableHead>Trabajado</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Tarde</TableHead>
                <TableHead>IP / Geo</TableHead>
                <TableHead>Mapa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {selectedDateRows.length === 0 && (
                <TableRow><TableCell colSpan={11} className="text-center text-slate-500 py-10">Sin datos para el día seleccionado.</TableCell></TableRow>
              )}
              {selectedDateRows.map((r) => {
                const access = accessRows.find((a) => a.created_at.slice(0, 10) === r.date && String(a.employee_name ?? "").toLowerCase() === r.employee.toLowerCase());
                return (
                  <TableRow key={r.id} className={r.status === "late" ? "bg-rose-50" : r.status === "ok" ? "bg-emerald-50/40" : ""}>
                    <TableCell className="font-black">{r.employee}<div className="text-xs font-normal text-slate-500">{r.department}</div></TableCell>
                    <TableCell>{r.center}</TableCell>
                    <TableCell>{r.shift}</TableCell>
                    <TableCell>{r.expectedEntry}</TableCell>
                    <TableCell>{timeOnly(r.entry) ?? "—"}</TableCell>
                    <TableCell>{timeOnly(r.exit) ?? "—"}</TableCell>
                    <TableCell>{fmtMinutes(r.workedMinutes)}</TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell>{r.lateMinutes > 0 ? `${r.lateMinutes} min` : "—"}</TableCell>
                    <TableCell>
                      <div className="font-mono text-xs">{r.ip}</div>
                      <div className="mt-1">{networkBadge(r.network)}</div>
                    </TableCell>
                    <TableCell>
                      {access ? <Button size="sm" variant="outline" onClick={() => setSelectedId(access.id)}>Ver</Button> : <span className="text-xs text-slate-400">—</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
      </ModuleFrame>

      <ModuleFrame id="executive">
      <Card className="rounded-[1.7rem] bg-white/90 shadow-sm overflow-hidden">
        <div className="border-b bg-[#d9eef6] p-4"><h2 className="font-black">Vista ejecutiva para coordinadores / jefes</h2><p className="text-xs text-slate-600">Agrupado por trabajador. Ordenado por mayor número de tardanzas.</p></div>
        <div className="overflow-auto"><Table><TableHeader><TableRow><TableHead>Trabajador</TableHead><TableHead>Registros</TableHead><TableHead>A tiempo</TableHead><TableHead>Tardanzas</TableHead><TableHead>Ausencias</TableHead><TableHead>Pendientes</TableHead><TableHead>Trabajado</TableHead><TableHead>Min. tarde</TableHead><TableHead>Resultado</TableHead></TableRow></TableHeader><TableBody>
          {executiveRows.map((r) => (<TableRow key={r.employee} className={r.late ? "bg-rose-50" : r.ok ? "bg-emerald-50/40" : ""}><TableCell className="font-black">{r.employee}</TableCell><TableCell>{r.rows}</TableCell><TableCell className="font-black text-emerald-700">{r.ok}</TableCell><TableCell className="font-black text-rose-700">{r.late}</TableCell><TableCell>{r.absent}</TableCell><TableCell>{r.pending}</TableCell><TableCell>{fmtMinutes(r.worked)}</TableCell><TableCell>{r.lateMins || "—"}</TableCell><TableCell>{r.late ? <Badge className="bg-rose-600 text-white">Revisar</Badge> : r.pending ? <Badge variant="outline">Completar</Badge> : <Badge className="bg-emerald-600 text-white">Correcto</Badge>}</TableCell></TableRow>))}
        </TableBody></Table></div>
      </Card>
      </ModuleFrame>

      <ModuleFrame id="map">
      <Card className="rounded-[1.7rem] bg-white/90 p-4 shadow-sm">
        <div className="mb-3 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-black flex items-center gap-2"><MapPin className="w-5 h-5" /> Mapa y evidencias Geo-IP</h2>
            <p className="text-xs text-slate-500">El mapa ya no ocupa toda la pantalla. Se abre como detalle del registro seleccionado.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge variant="outline">Capturas: {accessRows.length}</Badge>
            <Badge className={kpis.review > 0 ? "bg-rose-600 text-white" : "bg-emerald-600 text-white"}>Sospechosas: {kpis.review}</Badge>
          </div>
        </div>
        {selected ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50" onWheelCapture={(ev) => { if (!ev.ctrlKey && !ev.metaKey) ev.stopPropagation(); }}>
              <div className={mapInteractionEnabled ? "pointer-events-auto" : "pointer-events-none"}><AccessMap snapshot={selected} height={260} /></div>
              {!mapInteractionEnabled && <div className="pointer-events-none absolute inset-x-3 top-3 rounded-2xl border border-white/70 bg-white/90 px-3 py-2 text-xs font-black text-slate-700 shadow-lg backdrop-blur">Mapa bloqueado. Mantén Ctrl para mover/zoom.</div>}
            </div>
            <div className="space-y-2 text-sm">
              <div><span className="text-slate-500">Trabajador:</span><br /><strong>{selected.employee_name ?? "—"}</strong></div>
              <div><span className="text-slate-500">Evento:</span><br /><strong>{eventLabel(selected.event_type)}</strong></div>
              <div><span className="text-slate-500">Hora:</span><br /><strong>{new Date(selected.created_at).toLocaleString("es-ES")}</strong></div>
              <div><span className="text-slate-500">IP:</span><br /><code className="text-xs">{selected.ip_address ?? "—"}</code></div>
              <div><span className="text-slate-500">GPS:</span><br /><code className="text-xs">{selected.latitude?.toFixed(6) ?? "—"}, {selected.longitude?.toFixed(6) ?? "—"}</code></div>
              <Badge className={`${riskClasses(selected.risk_level)} gap-1`}><RiskIcon level={selected.risk_level} /> {riskLabel(selected.risk_level)}</Badge>
              <div className="rounded-2xl border bg-slate-50 p-3 text-xs"><strong>Motivo:</strong> {selected.risk_reason ?? "—"}</div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed p-8 text-center text-slate-500">Selecciona un registro con mapa.</div>
        )}
      </Card>
      </ModuleFrame>

      <ModuleFrame id="detail">
      <Card className="rounded-[1.7rem] bg-white/90 shadow-sm overflow-hidden">
        <div className="border-b bg-[#d9eef6] p-4">
          <h2 className="font-black">Detalle completo del rango</h2>
          <p className="text-xs text-slate-500">Toda la información filtrada. Esto es lo que se exporta a XLSX/PDF.</p>
        </div>
        <div className="overflow-auto max-h-[520px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Trabajador</TableHead>
                <TableHead>Turno</TableHead>
                <TableHead>Entrada</TableHead>
                <TableHead>Salida</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Trabajado</TableHead>
                <TableHead>Fuente</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((r) => (
                <TableRow key={`${r.id}-full`}>
                  <TableCell>{r.date}</TableCell>
                  <TableCell className="font-medium">{r.employee}</TableCell>
                  <TableCell>{r.shift}</TableCell>
                  <TableCell>{timeOnly(r.entry) ?? "—"}</TableCell>
                  <TableCell>{timeOnly(r.exit) ?? "—"}</TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                  <TableCell>{fmtMinutes(r.workedMinutes)}</TableCell>
                  <TableCell><Badge variant="outline">{r.source}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
      </ModuleFrame>
      </div>
    </div>
  );
}

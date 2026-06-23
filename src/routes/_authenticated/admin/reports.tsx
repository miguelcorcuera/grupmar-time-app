import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Info,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { VersionBadge } from "@/lib/grupmarAdminLocal";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  head: () => ({ meta: [{ title: "Informe mensual — GrupMar Time" }] }),
  component: ReportsPage,
});

type ReportRow = {
  employee_name: string;
  email: string;
  employee_code?: string | null;
  entries: number;
  exits: number;
  lunch_start: number;
  lunch_end: number;
  late: number;
  alerts: number;
  total_events: number;
  source: string;
};

type Insight = { title: string; value: string; note: string; tone: "ok" | "warn" | "danger" | "info" };

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const endDate = new Date(y, m, 0).toISOString().slice(0, 10);
  return { start, end: endDate, days: new Date(y, m, 0).getDate() };
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
}

function pct(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function statusForRow(row: ReportRow) {
  if (row.late >= 5 || row.alerts >= 5) return { label: "Crítico", className: "bg-rose-600 text-white", tone: "danger" as const };
  if (row.late > 0 || row.alerts > 0 || row.entries > row.exits + 2) return { label: "Revisar", className: "bg-amber-500 text-black", tone: "warn" as const };
  if (row.entries === 0 && row.total_events === 0) return { label: "Sin actividad", className: "bg-slate-200 text-slate-700", tone: "info" as const };
  return { label: "Correcto", className: "bg-emerald-600 text-white", tone: "ok" as const };
}

function toneCardClass(tone: Insight["tone"]) {
  if (tone === "ok") return "border-emerald-200 bg-emerald-50";
  if (tone === "warn") return "border-amber-200 bg-amber-50";
  if (tone === "danger") return "border-rose-200 bg-rose-50";
  return "border-sky-200 bg-sky-50";
}

function toneTextClass(tone: Insight["tone"]) {
  if (tone === "ok") return "text-emerald-700";
  if (tone === "warn") return "text-amber-700";
  if (tone === "danger") return "text-rose-700";
  return "text-sky-700";
}

function ReportsPage() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");
  const [selectedView, setSelectedView] = useState<"executive" | "detail">("executive");

  async function load() {
    setLoading(true);
    try {
      const { start, end } = monthRange(month);
      const [profilesRes, eventsRes, summaryRes, alertsRes] = await Promise.all([
        (supabase as any).from("profiles").select("id, full_name, email, employee_code, active").order("full_name"),
        (supabase as any).from("attendance_events").select("employee_id, event_type, event_date").gte("event_date", start).lte("event_date", end),
        (supabase as any).from("attendance_daily_summary").select("profile_id, late_minutes, work_date").gte("work_date", start).lte("work_date", end),
        (supabase as any).from("alerts").select("employee_id, created_at").gte("created_at", `${start}T00:00:00`).lte("created_at", `${end}T23:59:59`),
      ]);

      const profiles = (!profilesRes.error && profilesRes.data ? profilesRes.data : []) as any[];
      const events = (!eventsRes.error && eventsRes.data ? eventsRes.data : []) as any[];
      const summaries = (!summaryRes.error && summaryRes.data ? summaryRes.data : []) as any[];
      const alerts = (!alertsRes.error && alertsRes.data ? alertsRes.data : []) as any[];

      const byId = new Map<string, ReportRow>();
      for (const p of profiles) {
        byId.set(String(p.id), {
          employee_name: p.full_name || p.email || "Sin nombre",
          email: p.email || "",
          employee_code: p.employee_code ?? null,
          entries: 0,
          exits: 0,
          lunch_start: 0,
          lunch_end: 0,
          late: 0,
          alerts: 0,
          total_events: 0,
          source: profilesRes.error ? "Error Supabase" : "Supabase",
        });
      }

      for (const ev of events) {
        const r = byId.get(String(ev.employee_id));
        if (!r) continue;
        const type = String(ev.event_type || "").toLowerCase();
        r.total_events += 1;
        if (type.includes("entry")) r.entries += 1;
        else if (type.includes("exit")) r.exits += 1;
        else if (type.includes("lunch_start")) r.lunch_start += 1;
        else if (type.includes("lunch_end")) r.lunch_end += 1;
      }
      for (const sm of summaries) {
        const r = byId.get(String(sm.profile_id));
        if (r && Number(sm.late_minutes ?? 0) > 0) r.late += 1;
      }
      for (const al of alerts) {
        const r = byId.get(String(al.employee_id));
        if (r) r.alerts += 1;
      }

      const result = Array.from(byId.values()).sort((a, b) => {
        const aRisk = a.late * 3 + a.alerts * 2 + Math.max(0, a.entries - a.exits);
        const bRisk = b.late * 3 + b.alerts * 2 + Math.max(0, b.entries - b.exits);
        return bRisk - aRisk || a.employee_name.localeCompare(b.employee_name);
      });

      setRows(result);
      setNote(
        events.length
          ? "Reporte construido con marcaciones reales del mes. La tabla está ordenada por prioridad de revisión."
          : "No hay marcaciones reales para ese mes. Se muestran trabajadores para control, pero no debe interpretarse como actividad real."
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const totals = useMemo(() => rows.reduce((a, r) => ({
    entries: a.entries + r.entries,
    exits: a.exits + r.exits,
    late: a.late + r.late,
    alerts: a.alerts + r.alerts,
    events: a.events + r.total_events,
    lunchStart: a.lunchStart + r.lunch_start,
    lunchEnd: a.lunchEnd + r.lunch_end,
    workersWithRisk: a.workersWithRisk + (statusForRow(r).tone === "warn" || statusForRow(r).tone === "danger" ? 1 : 0),
  }), { entries: 0, exits: 0, late: 0, alerts: 0, events: 0, lunchStart: 0, lunchEnd: 0, workersWithRisk: 0 }), [rows]);

  const closureRate = pct(totals.exits, totals.entries);
  const lunchClosureRate = pct(totals.lunchEnd, totals.lunchStart);
  const workersOk = rows.filter((r) => statusForRow(r).tone === "ok").length;
  const riskRows = rows.filter((r) => statusForRow(r).tone === "warn" || statusForRow(r).tone === "danger");
  const topRisks = riskRows.slice(0, 4);
  const maxEvents = Math.max(1, ...rows.map((r) => r.total_events));

  const insights: Insight[] = [
    {
      title: "Cierre de jornada",
      value: `${closureRate}%`,
      note: `${totals.exits} salidas registradas sobre ${totals.entries} entradas`,
      tone: closureRate >= 90 ? "ok" : closureRate >= 70 ? "warn" : "danger",
    },
    {
      title: "Puntualidad",
      value: `${Math.max(0, 100 - pct(totals.late, Math.max(1, totals.entries)))}%`,
      note: `${totals.late} tardanzas detectadas en el mes`,
      tone: totals.late === 0 ? "ok" : totals.late <= 5 ? "warn" : "danger",
    },
    {
      title: "Almuerzos cerrados",
      value: `${lunchClosureRate}%`,
      note: `${totals.lunchEnd}/${totals.lunchStart} almuerzos con retorno`,
      tone: lunchClosureRate >= 90 || totals.lunchStart === 0 ? "ok" : lunchClosureRate >= 70 ? "warn" : "danger",
    },
    {
      title: "Trabajadores a revisar",
      value: String(totals.workersWithRisk),
      note: `${workersOk} trabajadores sin incidencias relevantes`,
      tone: totals.workersWithRisk === 0 ? "ok" : totals.workersWithRisk <= 2 ? "warn" : "danger",
    },
  ];

  function exportCsv() {
    const header = ["trabajador", "email", "codigo", "estado", "entradas", "salidas", "cierre_jornada_%", "inicio_almuerzo", "fin_almuerzo", "tardanzas", "alertas", "eventos_total", "fuente"];
    const lines = [
      header.join(","),
      ...rows.map((r) => [
        r.employee_name,
        r.email,
        r.employee_code ?? "",
        statusForRow(r).label,
        r.entries,
        r.exits,
        pct(r.exits, r.entries),
        r.lunch_start,
        r.lunch_end,
        r.late,
        r.alerts,
        r.total_events,
        r.source,
      ].map(csvEscape).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `informe_mensual_marcaciones_${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 space-y-6 bg-gradient-to-br from-slate-50 via-white to-sky-50 min-h-screen">
      <div className="flex justify-between gap-4 flex-wrap items-start">
        <div>
          <div className="mb-2"><VersionBadge /></div>
          <h1 className="text-3xl font-black mb-1 flex items-center gap-2 text-slate-950">
            <BarChart3 className="h-7 w-7 text-sky-700" /> Informe mensual de marcaciones
          </h1>
          <p className="text-sm text-slate-600 max-w-4xl">
            Panel ejecutivo para entender rápido quién cerró jornada, quién tiene tardanzas, qué almuerzos quedaron incompletos y qué trabajadores necesitan revisión.
          </p>
        </div>
        <div className="flex gap-2 items-end rounded-2xl border border-sky-100 bg-white/80 p-3 shadow-sm">
          <div>
            <Label className="text-xs font-black text-slate-600">Mes</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="bg-sky-50 border-sky-200" />
          </div>
          <Button onClick={load} disabled={loading} className="bg-sky-700 hover:bg-sky-800">
            <RefreshCw className="w-4 h-4 mr-2" /> Generar
          </Button>
          <Button variant="outline" onClick={exportCsv} className="border-sky-200 bg-white">
            <Download className="w-4 h-4 mr-2" /> CSV
          </Button>
        </div>
      </div>

      <Card className="rounded-3xl border-sky-100 bg-white/90 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-sky-100 p-3 text-sky-700"><Info className="h-5 w-5" /></div>
          <div>
            <h2 className="font-black text-slate-950">¿Para qué sirve esta pantalla?</h2>
            <p className="mt-1 text-sm text-slate-600">
              No es una tabla de números sueltos. Sirve para decidir acciones: cerrar jornadas pendientes, revisar trabajadores con más tardanzas, controlar almuerzos sin retorno y detectar si el mes está limpio o requiere seguimiento.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-4">
        {insights.map((item) => (
          <Card key={item.title} className={`rounded-3xl p-4 shadow-sm ${toneCardClass(item.tone)}`}>
            <div className="text-xs font-black uppercase tracking-wide text-slate-500">{item.title}</div>
            <div className={`mt-2 text-3xl font-black ${toneTextClass(item.tone)}`}>{item.value}</div>
            <div className="mt-1 text-xs text-slate-600">{item.note}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <Card className="rounded-3xl border-sky-100 bg-white/90 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-black text-slate-950 flex items-center gap-2"><TrendingUp className="h-5 w-5 text-sky-700" /> Lectura rápida de {monthLabel(month)}</h2>
              <p className="text-xs text-slate-500">Barras limpias para comparar actividad, cierres y riesgo por trabajador.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setSelectedView("executive")} className={`rounded-full px-3 py-1.5 text-xs font-black border ${selectedView === "executive" ? "bg-sky-100 border-sky-300 text-sky-900" : "bg-white text-slate-600"}`}>Ejecutivo</button>
              <button onClick={() => setSelectedView("detail")} className={`rounded-full px-3 py-1.5 text-xs font-black border ${selectedView === "detail" ? "bg-sky-100 border-sky-300 text-sky-900" : "bg-white text-slate-600"}`}>Detalle</button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {rows.map((r) => {
              const status = statusForRow(r);
              const close = pct(r.exits, r.entries);
              const width = Math.max(4, Math.round((r.total_events / maxEvents) * 100));
              return (
                <div key={`${r.email}-${r.employee_code}`} className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <div className="font-black text-slate-900">{r.employee_name}</div>
                      <div className="text-xs text-slate-500">{r.email || "sin email"}</div>
                    </div>
                    <Badge className={status.className}>{status.label}</Badge>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-[1fr_120px_120px_120px] items-center">
                    <div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full bg-sky-500" style={{ width: `${width}%` }} />
                      </div>
                      <div className="mt-1 text-xs text-slate-500">Actividad total: {r.total_events} eventos</div>
                    </div>
                    <div className="text-xs"><span className="font-black text-slate-900">{close}%</span><br /><span className="text-slate-500">cierre jornada</span></div>
                    <div className="text-xs"><span className={r.late ? "font-black text-rose-700" : "font-black text-emerald-700"}>{r.late}</span><br /><span className="text-slate-500">tardanzas</span></div>
                    <div className="text-xs"><span className={r.alerts ? "font-black text-amber-700" : "font-black text-emerald-700"}>{r.alerts}</span><br /><span className="text-slate-500">alertas</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="rounded-3xl border-sky-100 bg-white/90 p-5 shadow-sm">
          <h2 className="font-black text-slate-950 flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" /> Qué revisar primero</h2>
          <p className="mt-1 text-xs text-slate-500">Prioridad automática según tardanzas, alertas y jornadas abiertas.</p>
          <div className="mt-4 space-y-3">
            {topRisks.length === 0 ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex gap-2">
                <CheckCircle2 className="h-5 w-5" /> No hay trabajadores con incidencias relevantes en el mes.
              </div>
            ) : topRisks.map((r, idx) => {
              const openDays = Math.max(0, r.entries - r.exits);
              return (
                <div key={r.email || r.employee_name} className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                  <div className="flex justify-between gap-2">
                    <div className="font-black text-slate-900">{idx + 1}. {r.employee_name}</div>
                    <Badge variant="outline" className="bg-white">{statusForRow(r).label}</Badge>
                  </div>
                  <div className="mt-2 text-xs text-slate-700">
                    {r.late ? `${r.late} tardanza(s). ` : ""}{r.alerts ? `${r.alerts} alerta(s). ` : ""}{openDays ? `${openDays} jornada(s) sin salida.` : ""}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <div className="font-black text-slate-900 mb-2 flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Cómo interpretarlo</div>
            <p><b>Cierre de jornada</b>: compara salidas contra entradas. Si es bajo, faltan salidas.</p>
            <p className="mt-2"><b>Almuerzos cerrados</b>: compara fin de almuerzo contra inicio de almuerzo.</p>
            <p className="mt-2"><b>Trabajadores a revisar</b>: suma tardanzas, alertas y jornadas abiertas.</p>
          </div>
        </Card>
      </div>

      <Card className="rounded-3xl border-sky-100 bg-white/90 p-4 text-sm text-slate-600 shadow-sm flex items-center gap-2">
        <FileText className="h-4 w-4 text-sky-700" /> {note}
      </Card>

      {selectedView === "detail" && (
        <Card className="rounded-3xl border-sky-100 bg-white/90 shadow-sm overflow-hidden">
          <div className="border-b bg-sky-50 px-4 py-3">
            <h2 className="font-black text-slate-950">Detalle mensual completo</h2>
            <p className="text-xs text-slate-500">Para auditoría o exportación. La lectura principal está arriba.</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trabajador</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Entradas</TableHead>
                <TableHead>Salidas</TableHead>
                <TableHead>Cierre</TableHead>
                <TableHead>Almuerzo</TableHead>
                <TableHead>Tardanzas</TableHead>
                <TableHead>Alertas</TableHead>
                <TableHead>Total eventos</TableHead>
                <TableHead>Fuente</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const status = statusForRow(r);
                return (
                  <TableRow key={`${r.email}-${r.employee_code}`} className={status.tone === "danger" ? "bg-rose-50" : status.tone === "warn" ? "bg-amber-50" : ""}>
                    <TableCell><div className="font-medium">{r.employee_name}</div><div className="text-xs text-muted-foreground">{r.email}</div></TableCell>
                    <TableCell><Badge className={status.className}>{status.label}</Badge></TableCell>
                    <TableCell>{r.entries}</TableCell>
                    <TableCell>{r.exits}</TableCell>
                    <TableCell>{pct(r.exits, r.entries)}%</TableCell>
                    <TableCell>{r.lunch_start}/{r.lunch_end}</TableCell>
                    <TableCell>{r.late}</TableCell>
                    <TableCell>{r.alerts}</TableCell>
                    <TableCell>{r.total_events}</TableCell>
                    <TableCell>{r.source}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

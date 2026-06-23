import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Edit3,
  Eye,
  Filter,
  Grid2X2,
  LayoutGrid,
  Mail,
  Plus,
  Repeat,
  Save,
  Search,
  Settings,
  Smartphone,
  WandSparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { VersionBadge } from "@/lib/grupmarAdminLocal";


export const Route = createFileRoute("/_authenticated/admin/shifts")({
  head: () => ({ meta: [{ title: "Planificador de turnos — GrupMar Time" }] }),
  component: ShiftsPlannerPage,
});

type Employee = {
  id: string;
  full_name: string;
  email: string;
  employee_code?: string | null;
  department?: string | null;
  center?: string | null;
  active?: boolean | null;
};

type Shift = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  lunch_start_time?: string | null;
  lunch_end_time?: string | null;
  lunch_minutes?: number | null;
  tolerance_minutes?: number | null;
  exit_grace_minutes?: number | null;
  active?: boolean | null;
  color?: string | null;
  description?: string | null;
  flexible?: boolean | null;
};

type Plan = {
  id: string;
  employee_id: string;
  shift_id: string;
  date: string;
  project?: string;
  note?: string;
  published?: boolean;
};

const colorClasses = ["gmt-shift-blue", "gmt-shift-purple", "gmt-shift-yellow", "gmt-shift-green", "gmt-shift-pink"];
const SHIFTS_BUILD_VERSION = "Planificador v7.6 · turnos semanales reales + total 8h con almuerzo · 17/06/2026 21:35";
const WEEKLY_HOURS_LIMIT_KEY = "grupmar_time_weekly_hours_limit";

function getWeeklyHoursLimit() {
  return 40;
}

function shiftColorClass(value: string | null | undefined, index: number) {
  const v = String(value || "");
  if (v.startsWith("gmt-shift-")) return v;
  return colorClasses[index % colorClasses.length];
}

function toPlainTime(value: string | null | undefined) {
  return String(value || "").slice(0, 5);
}

// Color único por trabajador. No depende del día ni del turno.
// Usa el índice visible con golden-angle para evitar colores repetidos incluso con muchos trabajadores.
function employeeColorStyle(row: number) {
  const hue = Math.round((row * 137.508) % 360);
  return {
    backgroundColor: `hsl(${hue} 86% 91%)`,
    borderColor: `hsl(${hue} 76% 74%)`,
    color: `hsl(${hue} 44% 22%)`,
  } as const;
}

function employeeAvatarStyle(row: number) {
  const hue = Math.round((row * 137.508) % 360);
  return {
    background: `linear-gradient(135deg, hsl(${hue} 90% 88%), hsl(${hue} 90% 95%))`,
    borderColor: `hsl(${hue} 76% 74%)`,
    color: `hsl(${hue} 44% 22%)`,
  } as const;
}
const days = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, n: number) {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function mondayOf(date: string) {
  const d = new Date(date + "T12:00:00");
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

function hhmm(t?: string | null) {
  return (t || "").slice(0, 5);
}

function minutes(t?: string | null) {
  const [h, m] = hhmm(t).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function shiftGrossMinutes(s: Shift) {
  let diff = minutes(s.end_time) - minutes(s.start_time);
  if (diff < 0) diff += 24 * 60;
  return Math.max(0, diff);
}

function durationLabel(s: Shift) {
  const diff = shiftGrossMinutes(s);
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}



const emptyShift: Omit<Shift, "id"> = {
  name: "Nuevo horario",
  start_time: "09:00",
  end_time: "18:00",
  lunch_start_time: "13:00",
  lunch_end_time: "14:00",
  lunch_minutes: 60,
  tolerance_minutes: 10,
  exit_grace_minutes: 10,
  active: true,
  color: "gmt-shift-blue",
  description: "Horario editable",
  flexible: true,
};

function ShiftsPlannerPage() {

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayISO()));
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [showNewShift, setShowNewShift] = useState(false);
  const [newShift, setNewShift] = useState<Omit<Shift, "id">>(emptyShift);
  const [search, setSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [selectedShift, setSelectedShift] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [replaceWeekExisting, setReplaceWeekExisting] = useState(true);
  const [weeklyHoursLimit, setWeeklyHoursLimit] = useState(() => getWeeklyHoursLimit());
  const [plannerLoaded, setPlannerLoaded] = useState(false);
  const [savingPlanner, setSavingPlanner] = useState(false);
  const [draggingPlanId, setDraggingPlanId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ employeeId: string; date: string } | null>(null);

  async function loadPlanner() {
    setSavingPlanner(true);
    try {
      const dateTo = addDays(weekStart, 6);

      const [profilesRes, shiftsRes, plansRes] = await Promise.all([
        (supabase as any)
          .from("profiles")
          .select("id, full_name, email, employee_code, department, work_center, company_name, active")
          .eq("active", true)
          .order("full_name"),
        (supabase as any)
          .from("shift_templates")
          .select("id, name, start_time, end_time, lunch_start, lunch_end, lunch_minutes, entry_tolerance_minutes, exit_grace_minutes, active, color, description, weekly_hours")
          .eq("active", true)
          .order("start_time", { ascending: true }),
        (supabase as any)
          .from("employee_shift_plans")
          .select("id, profile_id, shift_template_id, work_date, project, note, published")
          .gte("work_date", weekStart)
          .lte("work_date", dateTo)
          .order("work_date", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (shiftsRes.error) throw shiftsRes.error;
      if (plansRes.error) throw plansRes.error;

      const nextEmployees = ((profilesRes.data ?? []) as any[]).map((p) => ({
        id: p.id,
        full_name: p.full_name,
        email: p.email ?? "",
        employee_code: p.employee_code ?? null,
        department: p.department ?? p.company_name ?? null,
        center: p.work_center ?? null,
        active: p.active,
      }));

      const nextShifts = ((shiftsRes.data ?? []) as any[]).map((x, i) => ({
        id: x.id,
        name: x.name,
        start_time: toPlainTime(x.start_time),
        end_time: toPlainTime(x.end_time),
        lunch_start_time: toPlainTime(x.lunch_start),
        lunch_end_time: toPlainTime(x.lunch_end),
        lunch_minutes: x.lunch_minutes ?? 60,
        tolerance_minutes: x.entry_tolerance_minutes ?? 10,
        exit_grace_minutes: x.exit_grace_minutes ?? 5,
        active: x.active,
        color: shiftColorClass(x.color, i),
        description: x.description || `${x.name} ${toPlainTime(x.start_time)}-${toPlainTime(x.end_time)}`,
        flexible: true,
      }));

      const nextPlans = ((plansRes.data ?? []) as any[]).map((p) => ({
        id: p.id,
        employee_id: p.profile_id,
        shift_id: p.shift_template_id,
        date: p.work_date,
        project: p.project ?? "Sin proyecto",
        note: p.note ?? undefined,
        published: Boolean(p.published),
      }));

      setEmployees(nextEmployees);
      setShifts(nextShifts);
      setPlans(nextPlans);
      setPlannerLoaded(true);
    } catch (err: any) {
      console.error(err);
      toast.error("No se pudo cargar el planificador desde Supabase.");
      setEmployees([]);
      setShifts([]);
      setPlans([]);
    } finally {
      setSavingPlanner(false);
    }
  }

  useEffect(() => {
    void loadPlanner();
  }, [weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedEmployee && employees[0]) setSelectedEmployee(employees[0].id);
  }, [employees, selectedEmployee]);

  useEffect(() => {
    if (!selectedShift && shifts[0]) setSelectedShift(shifts[0].id);
  }, [shifts, selectedShift]);

  const visibleDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const filteredEmployees = useMemo(() => {
    const q = search.toLowerCase().trim();
    return employees.filter((e) => !q || `${e.full_name} ${e.email} ${e.department} ${e.center}`.toLowerCase().includes(q));
  }, [employees, search]);

  const expectedHours = useMemo(() => {
    return plans.reduce((acc, p) => {
      const s = shifts.find((x) => x.id === p.shift_id);
      if (!s) return acc;
      return acc + shiftGrossMinutes(s) / 60;
    }, 0);
  }, [plans, shifts]);

  function shiftPlannedMinutes(s?: Shift) {
    if (!s) return 0;
    return shiftGrossMinutes(s);
  }

  function employeeWeeklyMinutes(employeeId: string) {
    const set = new Set(visibleDays);
    return plans
      .filter((p) => p.employee_id === employeeId && set.has(p.date))
      .reduce((acc, p) => acc + shiftPlannedMinutes(shifts.find((s) => s.id === p.shift_id)), 0);
  }

  function formatHoursDecimal(totalMinutes: number) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return m ? `${h}h ${String(m).padStart(2, "0")}m` : `${h}h`;
  }

  function projectedWeekMinutes(shiftId: string, weekdays = 5) {
    const s = shifts.find((x) => x.id === shiftId);
    return shiftPlannedMinutes(s) * weekdays;
  }

  
  async function applyWeekTemplate(employeeId: string, shiftId: string, options?: { replaceExisting?: boolean; silent?: boolean }) {
    const shift = shifts.find((x) => x.id === shiftId);
    const employee = employees.find((e) => e.id === employeeId);

    if (!employee || !shift) {
      toast.error("Selecciona trabajador y horario.");
      return;
    }

    const total = projectedWeekMinutes(shiftId, 5);
    const totalHours = total / 60;
    const replaceExisting = options?.replaceExisting ?? replaceWeekExisting;

    try {
      setSavingPlanner(true);
      const { error } = await (supabase as any).rpc("gmt_apply_week_template", {
        p_profile_id: employeeId,
        p_shift_template_id: shiftId,
        p_week_start: weekStart,
        p_replace_existing: replaceExisting,
        p_project: employee.center || employee.department || "Sin proyecto",
        p_note: replaceExisting ? "Plantilla semanal L-V aplicada" : "Plantilla semanal L-V añadida",
      });

      if (error) throw error;

      await loadPlanner();

      if (totalHours > weeklyHoursLimit) {
        toast.warning(`Semana aplicada, pero supera ${weeklyHoursLimit}h: ${formatHoursDecimal(total)}.`);
      } else if (!options?.silent) {
        toast.success(`Semana L-V aplicada a ${employee.full_name}: ${formatHoursDecimal(total)}.`);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "No se pudo aplicar la semana L-V en Supabase.");
    } finally {
      setSavingPlanner(false);
    }
  }

  function persistPlans(next: Plan[]) {
    setPlans(next);
  }

  
  function persistShifts(next: Shift[]) {
    setShifts(next);
  }

  
  async function addPlan(employee_id: string, date: string, shift_id = selectedShift || shifts[0]?.id) {
    if (!shift_id) {
      toast.error("Primero crea un horario.");
      return;
    }

    const employee = employees.find((e) => e.id === employee_id);

    try {
      setSavingPlanner(true);
      const { error } = await (supabase as any).rpc("gmt_create_shift_plan", {
        p_profile_id: employee_id,
        p_shift_template_id: shift_id,
        p_work_date: date,
        p_project: employee?.center || employee?.department || "Sin proyecto",
        p_note: null,
      });

      if (error) throw error;
      await loadPlanner();
      toast.success("Turno agregado al planificador.");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "No se pudo agregar el turno en Supabase.");
    } finally {
      setSavingPlanner(false);
    }
  }

  
  async function movePlan(planId: string, targetEmployeeId: string, targetDate: string) {
    const current = plans.find((p) => p.id === planId);
    if (!current) return;

    if (current.employee_id === targetEmployeeId && current.date === targetDate) {
      setDraggingPlanId(null);
      setDropTarget(null);
      return;
    }

    try {
      setSavingPlanner(true);
      const { error } = await (supabase as any).rpc("gmt_move_shift_plan", {
        p_plan_id: planId,
        p_target_profile_id: targetEmployeeId,
        p_target_work_date: targetDate,
      });

      if (error) throw error;
      await loadPlanner();
      setDraggingPlanId(null);
      setDropTarget(null);
      toast.success("Turno movido y guardado en Supabase. Queda sin publicar hasta confirmar.");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "No se pudo mover el turno en Supabase.");
    } finally {
      setSavingPlanner(false);
    }
  }

  function handlePlanDragStart(ev: React.DragEvent<HTMLButtonElement>, planId: string) {
    ev.dataTransfer.effectAllowed = "move";
    ev.dataTransfer.setData("text/plain", planId);
    setDraggingPlanId(planId);
  }

  function handleCellDrop(ev: React.DragEvent<HTMLDivElement>, employeeId: string, date: string) {
    ev.preventDefault();
    const planId = ev.dataTransfer.getData("text/plain") || draggingPlanId;
    if (!planId) return;
    movePlan(planId, employeeId, date);
  }

  
  async function duplicatePlan(p: Plan) {
    try {
      setSavingPlanner(true);
      const { error } = await (supabase as any).rpc("gmt_duplicate_shift_plan", {
        p_plan_id: p.id,
      });

      if (error) throw error;
      await loadPlanner();
      toast.success("Turno duplicado.");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "No se pudo duplicar el turno en Supabase.");
    } finally {
      setSavingPlanner(false);
    }
  }

  
  async function deletePlan(id: string) {
    try {
      setSavingPlanner(true);
      const { error } = await (supabase as any).rpc("gmt_delete_shift_plan", {
        p_plan_id: id,
      });

      if (error) throw error;
      await loadPlanner();
      setSelectedPlan(null);
      toast.success("Turno eliminado del plan.");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "No se pudo eliminar el turno en Supabase.");
    } finally {
      setSavingPlanner(false);
    }
  }

  
  async function saveNewShift() {
    if (!newShift.name.trim()) {
      toast.error("Indica el nombre del horario.");
      return;
    }

    try {
      setSavingPlanner(true);
      const weekly = shiftGrossMinutes(newShift as Shift) * 5 / 60;
      const { data, error } = await (supabase as any).rpc("gmt_create_shift_template", {
        p_name: newShift.name,
        p_start_time: newShift.start_time,
        p_end_time: newShift.end_time,
        p_lunch_start: newShift.lunch_start_time || null,
        p_lunch_end: newShift.lunch_end_time || null,
        p_lunch_minutes: newShift.lunch_minutes ?? 60,
        p_color: newShift.color || "gmt-shift-blue",
        p_description: newShift.description || null,
        p_weekly_hours: weekly,
      });

      if (error) throw error;
      await loadPlanner();
      if (data?.id) setSelectedShift(data.id);
      setNewShift(emptyShift);
      setShowNewShift(false);
      toast.success("Horario creado en Supabase.");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "No se pudo crear el horario en Supabase.");
    } finally {
      setSavingPlanner(false);
    }
  }

  
  async function saveEditingShift() {
    if (!editingShift) return;

    try {
      setSavingPlanner(true);
      const weekly = shiftGrossMinutes(editingShift) * 5 / 60;
      const { error } = await (supabase as any).rpc("gmt_update_shift_template", {
        p_shift_template_id: editingShift.id,
        p_name: editingShift.name,
        p_start_time: editingShift.start_time,
        p_end_time: editingShift.end_time,
        p_lunch_start: editingShift.lunch_start_time || null,
        p_lunch_end: editingShift.lunch_end_time || null,
        p_lunch_minutes: editingShift.lunch_minutes ?? 60,
        p_color: editingShift.color || "gmt-shift-blue",
        p_description: editingShift.description || null,
        p_weekly_hours: weekly,
        p_active: editingShift.active ?? true,
      });

      if (error) throw error;
      await loadPlanner();
      setEditingShift(null);
      toast.success("Horario actualizado en Supabase.");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "No se pudo actualizar el horario en Supabase.");
    } finally {
      setSavingPlanner(false);
    }
  }

  
  async function publish() {
    try {
      setSavingPlanner(true);
      const { data, error } = await (supabase as any).rpc("gmt_publish_shift_plans", {
        p_date_from: visibleDays[0],
        p_date_to: visibleDays[6],
        p_profile_id: null,
      });

      if (error) throw error;
      await loadPlanner();
      toast.success(`Turnos publicados en Supabase. Cambios publicados: ${data ?? 0}.`);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "No se pudieron publicar los turnos en Supabase.");
    } finally {
      setSavingPlanner(false);
    }
  }

  async function saveSelectedPlan() {
    if (!selectedPlan) return;

    try {
      setSavingPlanner(true);
      const { error } = await (supabase as any).rpc("gmt_update_shift_plan", {
        p_plan_id: selectedPlan.id,
        p_shift_template_id: selectedPlan.shift_id,
        p_work_date: selectedPlan.date,
        p_project: selectedPlan.project ?? null,
        p_note: selectedPlan.note ?? null,
      });

      if (error) throw error;
      await loadPlanner();
      setSelectedPlan(null);
      toast.success("Asignación actualizada en Supabase.");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "No se pudo actualizar la asignación en Supabase.");
    } finally {
      setSavingPlanner(false);
    }
  }

  function planBlocks(employeeId: string, date: string) {
    return plans.filter((p) => p.employee_id === employeeId && p.date === date);
  }

  const selectedShiftObj = selectedPlan ? shifts.find((s) => s.id === selectedPlan.shift_id) : null;
  const selectedEmployeeObj = selectedPlan ? employees.find((e) => e.id === selectedPlan.employee_id) : null;
  return (
    <div className="gmt-page">
      <VersionBadge />

      <section className="gmt-hero">
        <div className="gmt-hero-card">
          <div className="gmt-kicker">Planificación digital de horarios de trabajo</div>
          <h1 className="gmt-title">Planificador avanzado de turnos</h1>
          <p className="gmt-subtitle">
            Vista diaria, semanal y mensual. Cada trabajador mantiene un color uniforme; solo libres/permisos cambian de color. Asigna varios turnos a un trabajador en un mismo día, configura horarios
            flexibles y publica cambios con notificaciones transparentes.
          </p>
          <div className="gmt-quick-grid">
            <div className="gmt-stat-card">
              <div className="gmt-stat-icon gmt-shift-blue"><Users className="w-4 h-4" /></div>
              <div className="gmt-stat-label">Trabajadores</div>
              <div className="gmt-stat-value">{employees.length}</div>
              <div className="gmt-stat-help">Equipo visible</div>
            </div>
            <div className="gmt-stat-card">
              <div className="gmt-stat-icon gmt-shift-purple"><CalendarClock className="w-4 h-4" /></div>
              <div className="gmt-stat-label">Turnos planificados</div>
              <div className="gmt-stat-value">{plans.length}</div>
              <div className="gmt-stat-help">Semana actual · L-V masivo</div>
            </div>
            <div className="gmt-stat-card">
              <div className="gmt-stat-icon gmt-shift-green"><Clock className="w-4 h-4" /></div>
              <div className="gmt-stat-label">Horas esperadas</div>
              <div className="gmt-stat-value">{expectedHours.toFixed(0)}h</div>
              <div className="gmt-stat-help">Total planificado</div>
            </div>
            <div className="gmt-stat-card">
              <div className="gmt-stat-icon gmt-shift-yellow"><Bell className="w-4 h-4" /></div>
              <div className="gmt-stat-label">Pendiente publicar</div>
              <div className="gmt-stat-value">{plans.filter((p) => !p.published).length}</div>
              <div className="gmt-stat-help">Cambios sin notificar</div>
            </div>
          </div>
        </div>

        <div className="gmt-panel">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="gmt-panel-title">App transparente</div>
              <p className="text-sm text-muted-foreground mt-1">El trabajador ve sus horarios publicados desde móvil.</p>
            </div>
            <Smartphone className="w-7 h-7 text-blue-600" />
          </div>
          <div className="mt-4 rounded-[30px] border bg-slate-950 p-2 shadow-xl max-w-[230px] mx-auto">
            <div className="rounded-[24px] bg-white p-4">
              <div className="text-xs font-black text-slate-500">Mi horario</div>
              <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px]">
                {days.map((d, i) => <div key={d} className={`rounded-lg py-1 ${i === 4 ? "bg-blue-600 text-white" : "bg-slate-100"}`}>{d[0]}</div>)}
              </div>
              <div className="mt-3 space-y-2 text-xs">
                {visibleDays.slice(0, 5).map((d, i) => {
                  const p = plans.find((x) => x.date === d);
                  const s = shifts.find((x) => x.id === p?.shift_id);
                  return <div key={d} className="rounded-xl border p-2"><b>{days[i]}</b> · {s ? `${hhmm(s.start_time)} - ${hhmm(s.end_time)}` : "Día libre"}</div>;
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="gmt-panel">
        <div className="gmt-toolbar">
          <div>
            <div className="gmt-panel-title">Organizador de turnos</div>
            <div className="text-sm text-muted-foreground">Arrastra un turno a otro día/trabajador para moverlo. Se guarda automáticamente y queda sin publicar hasta confirmar.</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="gmt-segment">
              <button className="gmt-seg-btn" data-active={view === "day"} onClick={() => setView("day")}>Día</button>
              <button className="gmt-seg-btn" data-active={view === "week"} onClick={() => setView("week")}>Semana</button>
              <button className="gmt-seg-btn" data-active={view === "month"} onClick={() => setView("month")}>Mes</button>
            </div>
            <Button className="gmt-secondary" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft className="w-4 h-4" /></Button>
            <span className="gmt-pill">{visibleDays[0]} → {visibleDays[6]}</span>
            <Button className="gmt-secondary" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight className="w-4 h-4" /></Button>
            <Button className="gmt-secondary" onClick={() => setWeekStart(mondayOf(todayISO()))}>Hoy</Button>
            <Button className="gmt-primary" disabled={savingPlanner} onClick={() => void publish()}>Publicar ({plans.filter((p) => !p.published).length})</Button>
          </div>
        </div>

        <div className="gmt-toolbar">
          <div className="relative min-w-[280px]">
            <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar empleado, centro, departamento..." className="pl-9 rounded-2xl border-blue-100" />
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <span className="text-xs font-black text-slate-500">Máx. semanal</span>
              <Input
                type="number"
                min={1}
                value={weeklyHoursLimit}
                onChange={(e) => setWeeklyHoursLimit(Math.max(1, Number(e.target.value) || 40))}
                className="h-8 w-20 rounded-xl text-center font-black"
              />
              <span className="text-xs font-black text-slate-500">h</span>
            </div>
            <Button className="gmt-secondary"><Filter className="w-4 h-4 mr-2" /> Filtros</Button>
            <Button className="gmt-secondary" onClick={() => setShowNewShift(true)}><Plus className="w-4 h-4 mr-2" /> Nuevo horario</Button>
            <Link to="/admin/employees" className="gmt-secondary inline-flex items-center px-4 py-2 text-sm font-black"><Users className="w-4 h-4 mr-2" /> Trabajadores</Link>
          </div>
        </div>

        <div className="gmt-week-template-panel">
          <div className="flex items-start gap-3">
            <div className="gmt-template-icon"><WandSparkles className="w-5 h-5" /></div>
            <div>
              <div className="font-black text-slate-900">Plantilla semanal rápida</div>
              <div className="text-sm text-slate-500">
                Aplica un horario de lunes a viernes en un solo clic. Si ya tenía horarios, puedes reemplazarlos para cuadrar la semana.
              </div>
            </div>
          </div>

          <div className="gmt-template-grid">
            <div>
              <Label>Trabajador</Label>
              <select className="gmt-input" value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)}>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code || e.email})</option>)}
              </select>
            </div>
            <div>
              <Label>Horario L-V</Label>
              <select className="gmt-input" value={selectedShift} onChange={(e) => setSelectedShift(e.target.value)}>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({hhmm(s.start_time)}-{hhmm(s.end_time)}) · {formatHoursDecimal(projectedWeekMinutes(s.id, 5))}
                  </option>
                ))}
              </select>
            </div>
            <div className="gmt-template-total">
              <div className="text-xs font-black text-slate-500">Total L-V proyectado</div>
              <div className={`text-2xl font-black ${projectedWeekMinutes(selectedShift, 5) / 60 > weeklyHoursLimit ? "text-red-600" : "text-emerald-700"}`}>
                {formatHoursDecimal(projectedWeekMinutes(selectedShift, 5))}
              </div>
              <div className="text-xs text-slate-500">Máximo configurado: {weeklyHoursLimit}h</div>
            </div>
            <label className="gmt-template-check">
              <input
                type="checkbox"
                checked={replaceWeekExisting}
                onChange={(e) => setReplaceWeekExisting(e.target.checked)}
              />
              <span>Reemplazar horarios existentes de lunes a viernes</span>
            </label>
            <Button className="gmt-primary h-full" onClick={() => void applyWeekTemplate(selectedEmployee, selectedShift)}>
              <Repeat className="w-4 h-4 mr-2" />
              Aplicar semana L-V
            </Button>
          </div>
        </div>

        <div className="rounded-3xl bg-[#f8fbff] p-3 border border-blue-50">
          <div className="gmt-planner">
            <div className="gmt-planner-head gmt-planner-corner"><Grid2X2 className="w-4 h-4 mr-2" /> Empleados</div>
            {visibleDays.map((d, i) => (
              <div key={d} className="gmt-planner-head">
                <div className="text-center">
                  <div>{days[i]}</div>
                  <div className="text-slate-900">{d.slice(8, 10)}</div>
                </div>
              </div>
            ))}

            {filteredEmployees.map((e, row) => {
              const weeklyMinutes = employeeWeeklyMinutes(e.id);
              const weeklyHours = weeklyMinutes / 60;
              const overLimit = weeklyHours > weeklyHoursLimit;
              const nearLimit = !overLimit && weeklyHours >= weeklyHoursLimit * 0.9;
              const empStyle = employeeColorStyle(row);
              return (
              <div key={e.id} className="contents">
                <div className="gmt-planner-employee">
                  <div className="gmt-emp-avatar" style={employeeAvatarStyle(row)}>{e.full_name?.slice(0, 1) || "?"}</div>
                  <div className="min-w-0">
                    <div className="gmt-emp-name">{e.full_name}</div>
                    <div className="gmt-emp-meta">{e.department || "Equipo"} · {e.center || "Centro"}</div>
                    <div className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-black ${
                      overLimit
                        ? "bg-red-100 text-red-700"
                        : nearLimit
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-100 text-emerald-700"
                    }`}>
                      {formatHoursDecimal(weeklyMinutes)} / {weeklyHoursLimit}h semana
                    </div>
                    <button
                      type="button"
                      className="gmt-row-template-btn"
                      onClick={() => {
                        setSelectedEmployee(e.id);
                        void applyWeekTemplate(e.id, selectedShift, { replaceExisting: true });
                      }}
                      title="Aplicar el horario seleccionado de lunes a viernes"
                    >
                      L-V rápido
                    </button>
                  </div>
                </div>
                {visibleDays.map((d) => {
                  const blocks = planBlocks(e.id, d);
                  return (
                    <div
                      key={`${e.id}-${d}`}
                      className={`gmt-planner-cell ${dropTarget?.employeeId === e.id && dropTarget?.date === d ? "gmt-drop-target" : ""}`}
                      onDragOver={(ev) => {
                        ev.preventDefault();
                        ev.dataTransfer.dropEffect = "move";
                      }}
                      onDragEnter={() => setDropTarget({ employeeId: e.id, date: d })}
                      onDragLeave={() => setDropTarget((prev) => prev?.employeeId === e.id && prev?.date === d ? null : prev)}
                      onDrop={(ev) => handleCellDrop(ev, e.id, d)}
                    >
                      {blocks.map((p) => {
                        const s = shifts.find((x) => x.id === p.shift_id);
                        if (!s) return null;
                        return (
                          <button
                            key={p.id}
                            draggable
                            onDragStart={(ev) => handlePlanDragStart(ev, p.id)}
                            onDragEnd={() => {
                              setDraggingPlanId(null);
                              setDropTarget(null);
                            }}
                            onClick={() => setSelectedPlan(p)}
                            className={`gmt-shift-chip w-full text-left cursor-grab active:cursor-grabbing ${draggingPlanId === p.id ? "gmt-dragging" : ""}`}
                            style={empStyle}
                            title="Arrastra este turno a otro día o trabajador"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span>{hhmm(s.start_time)} - {hhmm(s.end_time)}</span>
                              {!p.published && <span className="rounded-full bg-white/80 px-2 text-[10px]">sin publicar</span>}
                            </div>
                            <div className="text-[11px] opacity-80">{s.name}</div>
                            {p.project && <div className="mt-1 text-[10px] opacity-80">📍 {p.project}</div>}
                          </button>
                        );
                      })}
                      <button className="gmt-add-cell w-full" onClick={() => void addPlan(e.id, d)}>
                        <Plus className="w-4 h-4 mr-1" /> agregar
                      </button>
                    </div>
                  );
                })}
              </div>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span className="font-black text-slate-700">Regla visual:</span>
          <span className="rounded-full border bg-white px-3 py-2 font-black">Arrastra y suelta para mover turnos</span>
          <span className="rounded-full border bg-white px-3 py-2 font-black">Cada trabajador tiene un color único en toda la semana</span>
          <span className="gmt-shift-chip gmt-shift-free">Libre / sin turno</span>
          <span className="gmt-shift-chip gmt-shift-permission">Permiso / ausencia</span>
          <span className="rounded-full bg-emerald-100 px-3 py-2 font-black text-emerald-700">≤ {weeklyHoursLimit}h legal/configurable</span>
          <span className="rounded-full bg-red-100 px-3 py-2 font-black text-red-700">Exceso semanal</span>
        </div>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <div className="gmt-panel">
          <div className="flex items-center justify-between">
            <div>
              <div className="gmt-panel-title">Horarios configurados</div>
              <div className="text-sm text-muted-foreground">Lista de horarios que puedes aplicar dentro de tu organización.</div>
            </div>
            <Button className="gmt-primary" onClick={() => setShowNewShift(true)}><Plus className="w-4 h-4 mr-2" /> Nuevo horario</Button>
          </div>
          <div className="mt-4 overflow-auto rounded-2xl border">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left p-3">Nombre</th><th className="text-left p-3">Color</th><th className="text-left p-3">Descripción</th><th className="text-left p-3">Total</th><th className="text-left p-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="p-3 font-black">{s.name}</td>
                    <td className="p-3"><span className={`inline-block w-14 h-5 rounded-full border ${s.color || "gmt-shift-blue"}`} /></td>
                    <td className="p-3 text-slate-600">{s.description || `${hhmm(s.start_time)} - ${hhmm(s.end_time)}`}</td>
                    <td className="p-3">{durationLabel(s)}</td>
                    <td className="p-3"><Button size="sm" className="gmt-secondary" onClick={() => setEditingShift(s)}><Edit3 className="w-4 h-4 mr-2" /> Editar</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="gmt-panel">
          <div className="gmt-panel-title">Asignación rápida</div>
          <p className="text-sm text-muted-foreground">Asigna un turno puntual a cualquier trabajador sin salir del planificador.</p>
          <div className="mt-4 gmt-form-grid">
            <div>
              <Label>Trabajador</Label>
              <select className="gmt-input" value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)}>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code || e.email})</option>)}
              </select>
            </div>
            <div>
              <Label>Horario</Label>
              <select className="gmt-input" value={selectedShift} onChange={(e) => setSelectedShift(e.target.value)}>
                {shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({hhmm(s.start_time)}-{hhmm(s.end_time)})</option>)}
              </select>
            </div>
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button className="gmt-primary w-full" onClick={() => void addPlan(selectedEmployee, selectedDate, selectedShift)}><Plus className="w-4 h-4 mr-2" /> Asignar</Button>
            </div>
          </div>

          <div className="mt-5 rounded-2xl bg-blue-50 p-4">
            <div className="font-black flex items-center gap-2"><Mail className="w-4 h-4" /> Notificación de turno</div>
            <p className="text-sm text-slate-600 mt-1">Al publicar se enviará: “Tu horario ha sido actualizado. Revisa tu planificador para ver los cambios.”</p>
          </div>
        </div>
      </section>

      {selectedPlan && selectedShiftObj && (
        <div className="gmt-modal-backdrop">
          <div className="gmt-modal">
            <div className="flex items-start justify-between">
              <div>
                <div className="gmt-kicker">Editar asignación</div>
                <h2 className="text-2xl font-black">Turno de {selectedEmployeeObj?.full_name}</h2>
                <p className="text-sm text-muted-foreground">{selectedPlan.date} · {selectedShiftObj.name}</p>
              </div>
              <button onClick={() => setSelectedPlan(null)} className="gmt-icon-btn"><X className="w-4 h-4" /></button>
            </div>

            <div className="mt-5 gmt-form-grid">
              <div>
                <Label>Trabajador</Label>
                <select className="gmt-input" value={selectedPlan.employee_id} onChange={(e) => setSelectedPlan({ ...selectedPlan, employee_id: e.target.value })}>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              </div>
              <div>
                <Label>Horario</Label>
                <select className="gmt-input" value={selectedPlan.shift_id} onChange={(e) => setSelectedPlan({ ...selectedPlan, shift_id: e.target.value })}>
                  {shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({hhmm(s.start_time)}-{hhmm(s.end_time)})</option>)}
                </select>
              </div>
              <div>
                <Label>Fecha</Label>
                <Input type="date" value={selectedPlan.date} onChange={(e) => setSelectedPlan({ ...selectedPlan, date: e.target.value })} />
              </div>
              <div>
                <Label>Proyecto / ubicación</Label>
                <Input value={selectedPlan.project || ""} onChange={(e) => setSelectedPlan({ ...selectedPlan, project: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label>Nota</Label>
                <Input value={selectedPlan.note || ""} onChange={(e) => setSelectedPlan({ ...selectedPlan, note: e.target.value })} placeholder="Ej. refuerzo por evento, cambio aprobado..." />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-between gap-3">
              <div className="flex gap-2">
                <Button className="gmt-secondary" onClick={() => void duplicatePlan(selectedPlan)}><Copy className="w-4 h-4 mr-2" /> Duplicar</Button>
                <Button variant="destructive" onClick={() => void deletePlan(selectedPlan.id)}><Trash2 className="w-4 h-4 mr-2" /> Eliminar</Button>
              </div>
              <Button className="gmt-primary" onClick={() => { persistPlans(plans.map((p) => p.id === selectedPlan.id ? selectedPlan : p)); setSelectedPlan(null); toast.success("Asignación actualizada."); }}>
                <Save className="w-4 h-4 mr-2" /> Guardar cambios
              </Button>
            </div>
          </div>
        </div>
      )}

      {(showNewShift || editingShift) && (
        <div className="gmt-modal-backdrop">
          <div className="gmt-modal">
            <div className="flex items-start justify-between">
              <div>
                <div className="gmt-kicker">Configuración de horarios</div>
                <h2 className="text-2xl font-black">{editingShift ? "Editar horario" : "Nuevo horario"}</h2>
                <p className="text-sm text-muted-foreground">Define nombre, color, flexibilidad y periodos de trabajo.</p>
              </div>
              <button onClick={() => { setShowNewShift(false); setEditingShift(null); }} className="gmt-icon-btn"><X className="w-4 h-4" /></button>
            </div>

            <ShiftForm value={editingShift || newShift} onChange={(next) => editingShift ? setEditingShift({ ...(next as Shift), id: editingShift.id }) : setNewShift(next as Omit<Shift, "id">)} />

            <div className="mt-6 flex justify-end gap-3">
              <Button className="gmt-secondary" onClick={() => { setShowNewShift(false); setEditingShift(null); }}>Cancelar</Button>
              <Button className="gmt-primary" onClick={editingShift ? saveEditingShift : saveNewShift}><Save className="w-4 h-4 mr-2" /> Guardar horario</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ShiftForm({ value, onChange }: { value: Shift | Omit<Shift, "id">; onChange: (v: Shift | Omit<Shift, "id">) => void }) {
  const v = value as Shift;
  const set = (patch: Partial<Shift>) => onChange({ ...value, ...patch } as Shift);
  const weekTotal = durationLabel(v);

  return (
    <div className="mt-5">
      <div className="gmt-form-grid">
        <div>
          <Label>Nombre del horario</Label>
          <Input value={v.name || ""} onChange={(e) => set({ name: e.target.value })} placeholder="Ej. Turno de tarde 8h" />
        </div>
        <div>
          <Label>Descripción</Label>
          <Input value={v.description || ""} onChange={(e) => set({ description: e.target.value })} placeholder="Horario editable con flexibilidad" />
        </div>
        <div>
          <Label>Color</Label>
          <select className="gmt-input" value={v.color || "gmt-shift-blue"} onChange={(e) => set({ color: e.target.value })}>
            <option value="gmt-shift-blue">Azul / Mañana</option>
            <option value="gmt-shift-purple">Morado / Tarde</option>
            <option value="gmt-shift-green">Verde / Noche</option>
            <option value="gmt-shift-yellow">Amarillo / Parcial</option>
            <option value="gmt-shift-pink">Rosa / Refuerzo</option>
          </select>
        </div>
        <div>
          <Label>Margen de flexibilidad</Label>
          <Input type="number" value={v.tolerance_minutes ?? 10} onChange={(e) => set({ tolerance_minutes: Number(e.target.value) })} />
        </div>
      </div>

      <div className="mt-5 rounded-3xl border bg-slate-50 p-4">
        <div className="font-black mb-3 flex items-center gap-2"><Settings className="w-4 h-4" /> Periodos por día</div>
        {["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"].map((day) => (
          <div key={day} className="gmt-day-row">
            <div className="text-sm font-bold">{day}</div>
            <Input type="time" value={hhmm(v.start_time)} onChange={(e) => set({ start_time: e.target.value })} />
            <Input type="time" value={hhmm(v.end_time)} onChange={(e) => set({ end_time: e.target.value })} />
            <Button className="gmt-secondary" size="sm"><Plus className="w-4 h-4" /></Button>
            <div className="text-sm font-black">{weekTotal}</div>
          </div>
        ))}
        {["Sábado", "Domingo"].map((day) => (
          <div key={day} className="gmt-day-row opacity-70">
            <div className="text-sm font-bold">{day}</div>
            <Input value="--:--" readOnly />
            <Input value="--:--" readOnly />
            <Button className="gmt-secondary" size="sm"><Plus className="w-4 h-4" /></Button>
            <div className="text-sm">Libre</div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div>
          <Label>Almuerzo inicio</Label>
          <Input type="time" value={hhmm(v.lunch_start_time)} onChange={(e) => set({ lunch_start_time: e.target.value })} />
        </div>
        <div>
          <Label>Almuerzo fin</Label>
          <Input type="time" value={hhmm(v.lunch_end_time)} onChange={(e) => set({ lunch_end_time: e.target.value })} />
        </div>
        <div>
          <Label>Salida máxima tras hora final</Label>
          <Input type="number" value={v.exit_grace_minutes ?? 10} onChange={(e) => set({ exit_grace_minutes: Number(e.target.value) })} />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-2xl border bg-blue-50 p-4">
        <div>
          <div className="font-black">Total diario estimado: {durationLabel(v)}</div>
          <div className="text-sm text-muted-foreground">La entrada y salida pueden ser flexibles si ficha dentro del margen.</div>
        </div>
        <Badge className="bg-blue-600 text-white"><CheckCircle2 className="w-3 h-3 mr-1" /> Editable</Badge>
      </div>
    </div>
  );
}

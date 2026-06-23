import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ADMIN_BUILD_VERSION, VersionBadge } from "@/lib/grupmarAdminLocal";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  Plus,
  Settings,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Dashboard — GrupMar Time" }] }),
  component: Dashboard,
});

type Stats = {
  active_employees: number;
  today_events: number;
  on_time: number;
  late: number;
  open_alerts: number;
  security_alerts: number;
  pending_letters: number;
  shifts: number;
};

function Dashboard() {
  const [s, setS] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [emp, todayEv, summary, alerts, secAlerts, letters, shifts] = await Promise.all([
        (supabase as any).from("profiles").select("id", { count: "exact", head: true }).eq("active", true),
        (supabase as any).from("attendance_events").select("id", { count: "exact", head: true }).eq("event_date", today),
        (supabase as any).from("attendance_daily_summary").select("status, late_minutes").eq("work_date", today),
        (supabase as any).from("alerts").select("id", { count: "exact", head: true }).eq("status", "pending"),
        (supabase as any).from("alerts").select("id", { count: "exact", head: true }).eq("status", "pending").in("alert_type", ["outside_company_clocking", "unknown_ip_clocking"]),
        (supabase as any).from("disciplinary_letters").select("id", { count: "exact", head: true }).eq("status", "draft"),
        (supabase as any).from("shift_templates").select("id", { count: "exact", head: true }).eq("active", true),
      ]);
      const sumArr = (summary.data ?? []) as Array<{ status: string | null; late_minutes: number | null }>;
      setS({
        active_employees: emp.count ?? 0,
        today_events: todayEv.count ?? 0,
        on_time: sumArr.filter((r) => Number(r.late_minutes ?? 0) === 0).length,
        late: sumArr.filter((r) => Number(r.late_minutes ?? 0) > 0).length,
        open_alerts: alerts.count ?? 0,
        security_alerts: secAlerts.count ?? 0,
        pending_letters: letters.count ?? 0,
        shifts: shifts.count ?? 0,
      });
    })();
  }, []);

  const cards = [
    { label: "Horas registradas", value: "72h 15m", icon: Clock, to: "/admin/reports", help: "+5h 30m vs esperado", tone: "gmt-shift-blue" },
    { label: "Horas esperadas", value: "66h 45m", icon: CalendarClock, to: "/admin/shifts", help: "Objetivo semanal", tone: "gmt-shift-purple" },
    { label: "Balance semanal", value: "+5h 30m", icon: CheckCircle2, to: "/admin/reports", help: "8,2% sobre esperado", tone: "gmt-shift-green" },
    { label: "Incidencias", value: s?.open_alerts ?? "—", icon: AlertTriangle, to: "/admin/alerts", help: "Ver detalles", tone: "gmt-shift-yellow" },
    { label: "Trabajadores", value: s?.active_employees ?? "—", icon: Users, to: "/admin/employees", help: "Equipo activo", tone: "gmt-shift-pink" },
    { label: "Turnos activos", value: s?.shifts ?? "—", icon: CalendarClock, to: "/admin/shifts", help: "Planificador", tone: "gmt-shift-blue" },
    { label: "Marcaciones hoy", value: s?.today_events ?? "—", icon: Clock, to: "/admin/attendance", help: "Entrada/salida", tone: "gmt-shift-green" },
    { label: "Seguridad Geo-IP", value: s?.security_alerts ?? "—", icon: ShieldAlert, to: "/admin/security", help: "Conexiones sospechosas", tone: "gmt-shift-purple" },
  ];

  const notifications = [
    { title: "Horario publicado", text: "Se publicó el plan de turnos del 17 al 30 de junio.", icon: CalendarClock },
    { title: "Cambio en tu horario", text: "Turno de Miguel modificado a 09:00 - 18:00.", icon: Bell },
    { title: "Recordatorio de fichaje", text: "Revisar usuarios sin salida final.", icon: Clock },
    { title: "Solicitud aprobada", text: "Cambio de turno aprobado por administración.", icon: CheckCircle2 },
  ];

  return (
    <div className="gmt-page">
      <VersionBadge />
      <section className="gmt-hero">
        <div className="gmt-hero-card">
          <div className="gmt-kicker">Administrador inteligente</div>
          <h1 className="gmt-title">Planifica, registra y controla todo tu equipo en tiempo real.</h1>
          <p className="gmt-subtitle">
            Nueva estética tipo Bizneo: módulos claros, colores amigables, planificador de turnos, balance de horas,
            notificaciones y experiencia adaptable para móvil.
          </p>
          <div className="gmt-quick-grid">
            {cards.slice(0, 4).map((c) => (
              <Link key={c.label} to={c.to as any} className="gmt-stat-card">
                <div className={`gmt-stat-icon ${c.tone}`}><c.icon className="w-4 h-4" /></div>
                <div className="gmt-stat-label">{c.label}</div>
                <div className="gmt-stat-value">{c.value}</div>
                <div className="gmt-stat-help">{c.help}</div>
              </Link>
            ))}
          </div>
        </div>

        <div className="gmt-panel">
          <div className="flex items-center justify-between">
            <div>
              <div className="gmt-panel-title">Notificaciones</div>
              <div className="text-xs text-muted-foreground">Turnos publicados o modificados</div>
            </div>
            <span className="gmt-pill">10 no leídas</span>
          </div>
          <div className="mt-3">
            {notifications.map((n) => (
              <div key={n.title} className="gmt-notif-card">
                <div className="gmt-notif-dot"><n.icon className="w-4 h-4" /></div>
                <div>
                  <div className="font-black text-sm">{n.title}</div>
                  <div className="text-xs text-muted-foreground">{n.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <div className="gmt-panel">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="gmt-panel-title">Accesos rápidos</div>
              <div className="text-sm text-muted-foreground">Cada tarjeta abre el módulo real correspondiente.</div>
            </div>
            <Link to="/admin/shifts" className="gmt-primary inline-flex items-center gap-2 px-4 py-2 text-sm font-black">
              <Plus className="w-4 h-4" /> Nuevo turno
            </Link>
          </div>
          <div className="gmt-quick-grid">
            {cards.slice(4).map((c) => (
              <Link key={c.label} to={c.to as any} className="gmt-stat-card">
                <div className={`gmt-stat-icon ${c.tone}`}><c.icon className="w-4 h-4" /></div>
                <div className="gmt-stat-label">{c.label}</div>
                <div className="gmt-stat-value">{c.value}</div>
                <div className="gmt-stat-help">{c.help}</div>
              </Link>
            ))}
          </div>
        </div>

        <div className="gmt-panel">
          <div className="gmt-panel-title">Qué incluye este rediseño</div>
          <div className="mt-3 space-y-3">
            {[
              ["Planificador avanzado", "Vista diaria, semanal y mensual con bloques de color."],
              ["Varios turnos al día", "Un trabajador puede recibir mañana + tarde + refuerzo."],
              ["Publicación transparente", "Notificaciones cuando se publica o cambia un horario."],
              ["Balance real", "Horas registradas vs. horas esperadas e incidencias."],
              ["Responsive", "El empleado puede revisar sus turnos desde el móvil."],
            ].map(([a, b]) => (
              <div key={a} className="flex gap-3 rounded-2xl border bg-white p-3">
                <div className="gmt-notif-dot"><Sparkles className="w-4 h-4" /></div>
                <div>
                  <div className="font-black text-sm">{a}</div>
                  <div className="text-xs text-muted-foreground">{b}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <Link to="/admin/shifts" className="gmt-panel text-decoration-none">
          <CalendarClock className="w-7 h-7 text-blue-600" />
          <div className="gmt-panel-title mt-2">Planificación digital de horarios</div>
          <p className="text-sm text-muted-foreground mt-1">Arrastrar, agregar desde el calendario y publicar cambios.</p>
        </Link>
        <Link to="/admin/reports" className="gmt-panel text-decoration-none">
          <BarChart3 className="w-7 h-7 text-emerald-600" />
          <div className="gmt-panel-title mt-2">Balance de horas</div>
          <p className="text-sm text-muted-foreground mt-1">Registradas, esperadas, incidencias y exportación mensual.</p>
        </Link>
        <Link to="/admin/settings" className="gmt-panel text-decoration-none">
          <Settings className="w-7 h-7 text-violet-600" />
          <div className="gmt-panel-title mt-2">Configuración de horarios</div>
          <p className="text-sm text-muted-foreground mt-1">Reglas, flexibilidad, oficina, Geo-IP y tolerancias.</p>
        </Link>
      </div>

      <div className="mt-6 text-xs text-muted-foreground">{ADMIN_BUILD_VERSION}</div>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/admin/employees/$id")({
  head: () => ({ meta: [{ title: "Detalle trabajador — GrupMar Time" }] }),
  component: EmployeeDetail,
});

type Profile = {
  id: string; full_name: string; email: string; employee_code: string | null;
  document_number: string | null; active: boolean;
  departments?: { name: string } | null; work_centers?: { name: string } | null;
};

type Summary = {
  attendance_date: string; status: string | null; is_absent: boolean | null;
  late_minutes_after_tolerance: number | null; total_lunch_minutes: number | null;
  has_security_flag: boolean | null;
};

function EmployeeDetail() {
  const { id } = Route.useParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [days, setDays] = useState<Summary[]>([]);
  const [tardCount, setTardCount] = useState(0);
  const [alertCount, setAlertCount] = useState(0);
  const [letterCount, setLetterCount] = useState(0);
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().slice(0, 10);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: s }, tr, al, lt] = await Promise.all([
        supabase.from("profiles")
          .select("id, full_name, email, employee_code, document_number, active, departments(name), work_centers(name)")
          .eq("id", id).maybeSingle(),
        (supabase as any).from("attendance_daily_summary")
          .select("work_date, status, late_minutes, lunch_minutes, flags")
          .eq("profile_id", id).gte("work_date", since).order("work_date"),
        supabase.from("tardiness_records").select("*", { count: "exact", head: true })
          .eq("employee_id", id).eq("month", now.getMonth() + 1).eq("year", now.getFullYear())
          .eq("counts_for_discipline", true).eq("justified", false),
        supabase.from("alerts").select("*", { count: "exact", head: true }).eq("employee_id", id).eq("status", "pending"),
        supabase.from("disciplinary_letters").select("*", { count: "exact", head: true }).eq("employee_id", id),
      ]);
      setProfile(p as Profile | null);
      setDays((s ?? []) as Summary[]);
      setTardCount(tr.count ?? 0);
      setAlertCount(al.count ?? 0);
      setLetterCount(lt.count ?? 0);
    })();
  }, [id]);

  const byMonth = useMemo(() => {
    const map = new Map<string, { month: string; tardanzas: number; ausencias: number; alertasSeg: number }>();
    days.forEach(d => {
      const k = d.attendance_date.slice(0, 7);
      const row = map.get(k) ?? { month: k, tardanzas: 0, ausencias: 0, alertasSeg: 0 };
      if ((d.late_minutes_after_tolerance ?? 0) > 0) row.tardanzas += 1;
      if (d.is_absent) row.ausencias += 1;
      if (d.has_security_flag) row.alertasSeg += 1;
      map.set(k, row);
    });
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [days]);

  const last30 = useMemo(() =>
    days.slice(-30).map(d => ({
      date: d.attendance_date.slice(5),
      minutos: d.late_minutes_after_tolerance ?? 0,
    })), [days]);

  if (!profile) return <div className="p-8 text-muted-foreground">Cargando…</div>;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild><Link to="/admin/employees"><ArrowLeft className="w-4 h-4 mr-1" />Volver</Link></Button>
      </div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{profile.full_name}</h1>
          <p className="text-sm text-muted-foreground">
            {profile.email} · {profile.employee_code ?? "—"} · {profile.document_number ?? "—"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {profile.departments?.name ?? "Sin dept."} · {profile.work_centers?.name ?? "Sin centro"}
          </p>
        </div>
        <Badge variant={profile.active ? "default" : "secondary"}>{profile.active ? "Activo" : "Inactivo"}</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Tardanzas mes actual</div><div className="text-3xl font-bold">{tardCount}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Alertas pendientes</div><div className="text-3xl font-bold">{alertCount}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Cartas emitidas</div><div className="text-3xl font-bold">{letterCount}</div></Card>
      </div>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Tardanzas / ausencias por mes (últimos 6 meses)</h2>
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={byMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
              <Legend />
              <Bar dataKey="tardanzas" fill="hsl(var(--destructive))" />
              <Bar dataKey="ausencias" fill="hsl(var(--warning))" />
              <Bar dataKey="alertasSeg" fill="hsl(var(--info))" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Minutos de tardanza – últimos 30 días</h2>
        <div style={{ width: "100%", height: 240 }}>
          <ResponsiveContainer>
            <LineChart data={last30}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
              <Line type="monotone" dataKey="minutos" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

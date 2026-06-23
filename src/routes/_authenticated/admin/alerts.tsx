import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/alerts")({
  head: () => ({ meta: [{ title: "Alertas — GrupMar Time" }] }),
  component: AlertsPage,
});

type Alert = {
  id: string; employee_id: string | null; alert_type: string; severity: string;
  title: string; message: string; status: string; created_at: string;
  employee?: { full_name: string } | null;
};

function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filter, setFilter] = useState<"all" | "labor" | "security">("all");
  async function load() {
    const { data } = await supabase.from("alerts")
      .select("*, employee:profiles!alerts_employee_id_fkey(full_name)").order("created_at", { ascending: false }).limit(200);
    setAlerts((data ?? []) as Alert[]);
  }
  useEffect(() => { load(); }, []);
  async function markReviewed(id: string) {
    await supabase.from("alerts").update({ status: "reviewed", reviewed_at: new Date().toISOString() }).eq("id", id);
    toast.success("Alerta marcada como revisada");
    load();
  }
  const securityTypes = ["outside_company_clocking", "unknown_ip_clocking"];
  const filtered = alerts.filter(a =>
    filter === "all" ? true :
    filter === "security" ? securityTypes.includes(a.alert_type) :
    !securityTypes.includes(a.alert_type)
  );
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Alertas</h1>
          <p className="text-sm text-muted-foreground">{alerts.filter(a => a.status === "pending").length} pendientes.</p>
        </div>
        <div className="flex gap-2">
          {(["all", "labor", "security"] as const).map(f => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f === "all" ? "Todas" : f === "labor" ? "Laborales" : "Seguridad"}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        {filtered.length === 0 && <p className="text-muted-foreground text-sm">Sin alertas.</p>}
        {filtered.map(a => (
          <Card key={a.id} className="p-4">
            <div className="flex items-start gap-3">
              <Badge className={
                a.severity === "critical" ? "bg-destructive text-destructive-foreground" :
                a.severity === "warning" ? "bg-warning text-warning-foreground" :
                "bg-info text-info-foreground"
              }>{a.severity}</Badge>
              <div className="flex-1">
                <div className="font-semibold">{a.title}</div>
                <div className="text-sm text-muted-foreground mt-1">{a.message}</div>
                <div className="text-xs text-muted-foreground mt-2">
                  {a.employee?.full_name ?? "—"} · {new Date(a.created_at).toLocaleString("es-ES")} · {a.alert_type}
                </div>
              </div>
              <div className="flex flex-col gap-2 items-end">
                <Badge variant={a.status === "pending" ? "default" : "secondary"}>{a.status}</Badge>
                {a.status === "pending" && <Button size="sm" variant="outline" onClick={() => markReviewed(a.id)}>Marcar revisada</Button>}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

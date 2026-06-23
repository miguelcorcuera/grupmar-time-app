import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/security")({
  head: () => ({ meta: [{ title: "Seguridad — GrupMar Time" }] }),
  component: SecurityPage,
});

type SecLog = {
  id: string; created_at: string; event_type: string; ip_address: string | null;
  connection_location_status: string | null; risk_level: string | null;
  message: string | null; employee?: { full_name: string } | null;
};
type SummaryRow = {
  employee_id: string; full_name: string; total_clockings: number;
  company_network_clockings: number; outside_company_clockings: number;
  unknown_ip_clockings: number; last_ip_address: string | null; last_connection_location_status: string | null;
};

function SecurityPage() {
  const [logs, setLogs] = useState<SecLog[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  useEffect(() => {
    (async () => {
      const [a, b] = await Promise.all([
        supabase.from("security_logs").select("*, employee:profiles!security_logs_employee_id_fkey(full_name)").order("created_at", { ascending: false }).limit(100),
        supabase.from("v_security_clocking_summary").select("*").order("outside_company_clockings", { ascending: false }),
      ]);
      setLogs((a.data ?? []) as SecLog[]);
      setSummary((b.data ?? []) as SummaryRow[]);
    })();
  }, []);
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Seguridad</h1>
        <p className="text-sm text-muted-foreground">Resumen de marcaciones por red y registro de eventos sensibles.</p>
      </div>

      <Card>
        <div className="p-4 border-b font-semibold">Resumen por trabajador</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Trabajador</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Fuera</TableHead>
              <TableHead>IP desconocida</TableHead>
              <TableHead>Última IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.map(r => (
              <TableRow key={r.employee_id}>
                <TableCell className="font-medium">{r.full_name}</TableCell>
                <TableCell>{r.total_clockings}</TableCell>
                <TableCell><Badge className="bg-success text-success-foreground">{r.company_network_clockings}</Badge></TableCell>
                <TableCell>{r.outside_company_clockings > 0 ? <Badge className="bg-warning text-warning-foreground">{r.outside_company_clockings}</Badge> : 0}</TableCell>
                <TableCell>{r.unknown_ip_clockings > 0 ? <Badge variant="secondary">{r.unknown_ip_clockings}</Badge> : 0}</TableCell>
                <TableCell className="font-mono text-xs">{r.last_ip_address ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <div className="p-4 border-b font-semibold">Registro de eventos de seguridad</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Trabajador</TableHead>
              <TableHead>Evento</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Riesgo</TableHead>
              <TableHead>Mensaje</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sin eventos.</TableCell></TableRow>}
            {logs.map(l => (
              <TableRow key={l.id}>
                <TableCell className="text-xs">{new Date(l.created_at).toLocaleString("es-ES")}</TableCell>
                <TableCell>{l.employee?.full_name ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{l.event_type}</TableCell>
                <TableCell className="font-mono text-xs">{l.ip_address ?? "—"}</TableCell>
                <TableCell>{l.connection_location_status}</TableCell>
                <TableCell>{l.risk_level && <Badge variant={l.risk_level === "high" ? "destructive" : "secondary"}>{l.risk_level}</Badge>}</TableCell>
                <TableCell className="text-xs">{l.message}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, FileCheck2, RefreshCw, Search, Send, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmployeeRequestForm } from "@/components/employee-requests/EmployeeRequestForm";
import { EmployeeRequestStatusBadge } from "@/components/employee-requests/EmployeeRequestStatusBadge";
import { EmployeeRequestTypeBadge } from "@/components/employee-requests/EmployeeRequestTypeBadge";
import { employeeRequestTypeLabel } from "@/components/employee-requests/employeeRequestLabels";
import { useEmployeeRequests, type EmployeeRequest, type EmployeeRequestPayload } from "@/hooks/useEmployeeRequests";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const [year, month, day] = value.slice(0, 10).split("-");
  return [day, month, year].filter(Boolean).join("/");
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
}

function requestMainDate(item: EmployeeRequest) {
  if (item.request_type === "holiday_work") return formatDate(item.work_date);
  if (item.date_from || item.date_to) return formatDate(item.date_from) + " - " + formatDate(item.date_to);
  return formatDate(item.work_date);
}

function requestTimeRange(item: EmployeeRequest) {
  if (item.all_day) return "Todo el dia";
  if (item.start_time && item.end_time) return item.start_time.slice(0, 5) + " - " + item.end_time.slice(0, 5);
  if (item.start_time) return "Desde " + item.start_time.slice(0, 5);
  if (item.end_time) return "Hasta " + item.end_time.slice(0, 5);
  return "-";
}

function shortId(value?: string | null) {
  if (!value) return "-";
  return value.slice(0, 8);
}

export function EmployeeRequestsPanel() {
  const { requests, loading, saving, error, stats, loadRequests, createRequest, reviewRequest, applyRequest, cancelRequest } = useEmployeeRequests(true);
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<EmployeeRequest | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return requests.filter((item) => {
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesType = typeFilter === "all" || item.request_type === typeFilter;
      const haystack = [item.request_code, item.request_type, item.status, item.title, item.reason, item.employee_notes, item.manager_notes, item.rrhh_notes, item.profile_id].filter(Boolean).join(" ").toLowerCase();
      return matchesStatus && matchesType && (!needle || haystack.includes(needle));
    });
  }, [requests, search, statusFilter, typeFilter]);

  async function handleCreate(payload: EmployeeRequestPayload) {
    try {
      await createRequest(payload);
      setShowForm(false);
      toast.success("Solicitud enviada correctamente.");
    } catch (err: any) {
      toast.error(err?.message || "No se pudo crear la solicitud.");
    }
  }

  async function handleReview(decision: string) {
    if (!selected) return;
    const note = reviewNote.trim();

    if (["approved", "rejected", "postponed", "needs_info"].includes(decision) && note.length < 5) {
      toast.error("La nota debe tener al menos 5 caracteres.");
      return;
    }

    try {
      await reviewRequest(selected.id, decision, note || "Revision desde panel de solicitudes.");
      toast.success("Solicitud actualizada.");
      setSelected(null);
      setReviewNote("");
    } catch (err: any) {
      toast.error(err?.message || "No se pudo revisar la solicitud.");
    }
  }

  async function handleApply() {
    if (!selected) return;
    const note = reviewNote.trim();

    if (note.length < 5) {
      toast.error("La nota de aplicacion debe tener al menos 5 caracteres.");
      return;
    }

    try {
      await applyRequest(selected.id, note);
      toast.success("Solicitud aplicada.");
      setSelected(null);
      setReviewNote("");
    } catch (err: any) {
      toast.error(err?.message || "No se pudo aplicar la solicitud.");
    }
  }

  async function handleCancel() {
    if (!selected) return;
    const note = reviewNote.trim();

    if (note.length < 5) {
      toast.error("La nota de cancelacion debe tener al menos 5 caracteres.");
      return;
    }

    try {
      await cancelRequest(selected.id, note);
      toast.success("Solicitud cancelada.");
      setSelected(null);
      setReviewNote("");
    } catch (err: any) {
      toast.error(err?.message || "No se pudo cancelar la solicitud.");
    }
  }

  const kpis = [
    { label: "Total", value: stats.total, icon: ClipboardList },
    { label: "Pendientes", value: stats.pending, icon: Send },
    { label: "Aprobadas", value: stats.approved, icon: CheckCircle2 },
    { label: "Festivos aprobados", value: stats.holidayApproved, icon: FileCheck2 },
  ];

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.25em] text-sky-100">
              Employee requests · RPC only
            </div>
            <h1 className="text-3xl font-black tracking-tight lg:text-4xl">Solicitudes de personal</h1>
            <p className="mt-2 max-w-3xl text-sm font-medium text-slate-200">
              Bandeja canonica para vacaciones, permisos, ausencias, cambios de turno y trabajo en festivos. Las escrituras pasan por RPCs seguras.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={() => loadRequests()} disabled={loading || saving} className="bg-white text-slate-900 hover:bg-slate-100">
              <RefreshCw className="mr-2 h-4 w-4" />
              Actualizar
            </Button>
            <Button type="button" onClick={() => setShowForm((value) => !value)} disabled={saving}>
              {showForm ? "Cerrar formulario" : "Nueva solicitud"}
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">{item.label}</p>
                  <p className="mt-2 text-3xl font-black text-slate-950">{item.value}</p>
                </div>
                <div className="rounded-2xl bg-sky-50 p-3 text-sky-700">
                  <Icon className="h-6 w-6" />
                </div>
              </div>
            </Card>
          );
        })}
      </section>

      {showForm ? <EmployeeRequestForm saving={saving} onSubmit={handleCreate} onCancel={() => setShowForm(false)} /> : null}

      <Card className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1fr_220px_220px]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por codigo, motivo, estado o perfil..." />
          </label>

          <select className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">Todos los estados</option>
            <option value="submitted">Enviadas</option>
            <option value="under_review">En revision</option>
            <option value="needs_info">Requiere info</option>
            <option value="approved">Aprobadas</option>
            <option value="rejected">Rechazadas</option>
            <option value="postponed">Postergadas</option>
            <option value="cancelled">Canceladas</option>
            <option value="applied">Aplicadas</option>
            <option value="closed">Cerradas</option>
          </select>

          <select className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">Todos los tipos</option>
            <option value="holiday_work">Trabajo en festivo</option>
            <option value="vacation">Vacaciones</option>
            <option value="personal_permission">Permiso personal</option>
            <option value="overtime">Horas extra</option>
            <option value="shift_change">Cambio de turno</option>
            <option value="schedule_change">Cambio de horario</option>
            <option value="early_leave">Salida anticipada</option>
            <option value="late_arrival">Llegada tarde</option>
            <option value="absence">Ausencia</option>
            <option value="other">Otro</option>
          </select>
        </div>
      </Card>

      {error ? <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</div> : null}

      <section className="grid gap-4">
        {loading ? (
          <Card className="rounded-3xl border-slate-200 p-8 text-center text-sm font-bold text-slate-500">Cargando solicitudes...</Card>
        ) : filtered.length === 0 ? (
          <Card className="rounded-3xl border-slate-200 p-8 text-center text-sm font-bold text-slate-500">No hay solicitudes para los filtros actuales.</Card>
        ) : (
          filtered.map((item) => (
            <Card key={item.id} className="rounded-3xl border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="grid gap-4 xl:grid-cols-[1fr_auto]">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <EmployeeRequestTypeBadge type={item.request_type} />
                    <EmployeeRequestStatusBadge status={item.status} />
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{item.request_code || shortId(item.id)}</span>
                  </div>

                  <div>
                    <h2 className="text-lg font-black text-slate-950">{item.title || employeeRequestTypeLabel(item.request_type)}</h2>
                    <p className="mt-1 text-sm font-medium text-slate-600">{item.reason || item.employee_notes || "Sin descripcion registrada."}</p>
                  </div>

                  <div className="grid gap-3 text-sm md:grid-cols-4">
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Perfil</p>
                      <p className="mt-1 font-bold text-slate-800">{shortId(item.profile_id)}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Fecha</p>
                      <p className="mt-1 font-bold text-slate-800">{requestMainDate(item)}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Horario</p>
                      <p className="mt-1 font-bold text-slate-800">{requestTimeRange(item)}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Creada</p>
                      <p className="mt-1 font-bold text-slate-800">{formatDateTime(item.created_at)}</p>
                    </div>
                  </div>

                  {item.linked_holiday_authorization_id ? (
                    <p className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-xs font-bold text-violet-700">
                      Trabajo en festivo aprobado con autorizacion tecnica vinculada: {shortId(item.linked_holiday_authorization_id)}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2 xl:w-48">
                  <Button type="button" variant="outline" onClick={() => { setSelected(item); setReviewNote(item.manager_notes || ""); }}>
                    Revisar
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </section>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <Card className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-3xl border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Revision</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">{selected.title || employeeRequestTypeLabel(selected.request_type)}</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  <EmployeeRequestTypeBadge type={selected.request_type} />
                  <EmployeeRequestStatusBadge status={selected.status} />
                </div>
              </div>
              <Button type="button" variant="outline" onClick={() => { setSelected(null); setReviewNote(""); }}>Cerrar</Button>
            </div>

            <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Codigo</p>
                <p className="mt-1 font-bold text-slate-800">{selected.request_code || selected.id}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Perfil</p>
                <p className="mt-1 font-bold text-slate-800">{selected.profile_id}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Fecha</p>
                <p className="mt-1 font-bold text-slate-800">{requestMainDate(selected)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Horario</p>
                <p className="mt-1 font-bold text-slate-800">{requestTimeRange(selected)}</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Motivo / notas</p>
                <p className="mt-2 whitespace-pre-wrap text-sm font-medium text-slate-700">{selected.reason || selected.employee_notes || "Sin notas registradas."}</p>
              </div>

              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Nota de gestion</span>
                <Textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="La nota es obligatoria para aprobar, rechazar, postergar, aplicar o cancelar." />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" disabled={saving} onClick={() => handleReview("under_review")}>En revision</Button>
              <Button type="button" variant="outline" disabled={saving} onClick={() => handleReview("needs_info")}>Pedir info</Button>
              <Button type="button" variant="outline" disabled={saving} onClick={() => handleReview("postponed")}>Postergar</Button>
              <Button type="button" variant="outline" disabled={saving} onClick={() => handleReview("rejected")}><XCircle className="mr-2 h-4 w-4" />Rechazar</Button>
              <Button type="button" disabled={saving} onClick={() => handleReview("approved")}><CheckCircle2 className="mr-2 h-4 w-4" />Aprobar</Button>
              <Button type="button" variant="outline" disabled={saving} onClick={handleApply}>Aplicar</Button>
              <Button type="button" variant="outline" disabled={saving} onClick={handleCancel}>Cancelar</Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

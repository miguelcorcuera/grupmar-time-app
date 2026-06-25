import { FormEvent, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EMPLOYEE_REQUEST_TYPE_OPTIONS } from "./employeeRequestLabels";
import type { EmployeeRequestPayload, EmployeeRequestType } from "@/hooks/useEmployeeRequests";

type Props = {
  saving?: boolean;
  onSubmit: (payload: EmployeeRequestPayload) => Promise<void> | void;
  onCancel?: () => void;
};

const initialForm = {
  request_type: "holiday_work" as EmployeeRequestType,
  title: "",
  reason: "",
  employee_notes: "",
  work_date: "",
  date_from: "",
  date_to: "",
  start_time: "",
  end_time: "",
  all_day: false,
};

export function EmployeeRequestForm({ saving = false, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState(initialForm);
  const requiresWorkDate = form.request_type === "holiday_work";
  const requiresDateRange = form.request_type === "vacation";

  const helper = useMemo(() => {
    if (requiresWorkDate) return "Para trabajo en festivo, la fecha de trabajo es obligatoria.";
    if (requiresDateRange) return "Para vacaciones, indica fecha desde y hasta.";
    return "Completa las fechas u horas que apliquen a la solicitud.";
  }, [requiresDateRange, requiresWorkDate]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload: EmployeeRequestPayload = {
      request_type: form.request_type,
      status: "submitted",
      title: form.title.trim() || undefined,
      reason: form.reason.trim() || undefined,
      employee_notes: form.employee_notes.trim() || undefined,
      all_day: form.all_day,
    };

    if (form.work_date) payload.work_date = form.work_date;
    if (form.date_from) payload.date_from = form.date_from;
    if (form.date_to) payload.date_to = form.date_to;
    if (form.start_time) payload.start_time = form.start_time;
    if (form.end_time) payload.end_time = form.end_time;

    await onSubmit(payload);
    setForm(initialForm);
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Tipo</span>
          <select
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            value={form.request_type}
            onChange={(event) => update("request_type", event.target.value as EmployeeRequestType)}
          >
            {EMPLOYEE_REQUEST_TYPE_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Titulo</span>
          <Input value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="Ej. Trabajo en festivo por operativa" />
        </label>
      </div>

      <p className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-800">{helper}</p>

      <div className="grid gap-4 lg:grid-cols-3">
        <label className="space-y-1.5">
          <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Fecha trabajo</span>
          <Input type="date" value={form.work_date} required={requiresWorkDate} onChange={(event) => update("work_date", event.target.value)} />
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Desde</span>
          <Input type="date" value={form.date_from} required={requiresDateRange} onChange={(event) => update("date_from", event.target.value)} />
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Hasta</span>
          <Input type="date" value={form.date_to} required={requiresDateRange} onChange={(event) => update("date_to", event.target.value)} />
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <label className="space-y-1.5">
          <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Hora inicio</span>
          <Input type="time" value={form.start_time} onChange={(event) => update("start_time", event.target.value)} />
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Hora fin</span>
          <Input type="time" value={form.end_time} onChange={(event) => update("end_time", event.target.value)} />
        </label>

        <label className="flex items-end gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <input type="checkbox" className="h-5 w-5 rounded border-slate-300" checked={form.all_day} onChange={(event) => update("all_day", event.target.checked)} />
          <span className="pb-0.5 text-sm font-bold text-slate-700">Todo el dia</span>
        </label>
      </div>

      <label className="space-y-1.5">
        <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Motivo</span>
        <Textarea value={form.reason} onChange={(event) => update("reason", event.target.value)} placeholder="Explica el motivo de la solicitud." required />
      </label>

      <label className="space-y-1.5">
        <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Notas empleado</span>
        <Textarea value={form.employee_notes} onChange={(event) => update("employee_notes", event.target.value)} placeholder="Notas adicionales opcionales." />
      </label>

      <div className="flex flex-wrap justify-end gap-3">
        {onCancel ? <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancelar</Button> : null}
        <Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Enviar solicitud"}</Button>
      </div>
    </form>
  );
}

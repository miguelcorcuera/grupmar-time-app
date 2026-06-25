import { employeeRequestStatusLabel } from "./employeeRequestLabels";

const STATUS_CLASS: Record<string, string> = {
  draft: "border-slate-200 bg-slate-50 text-slate-700",
  submitted: "border-sky-200 bg-sky-50 text-sky-700",
  under_review: "border-indigo-200 bg-indigo-50 text-indigo-700",
  needs_info: "border-amber-200 bg-amber-50 text-amber-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-rose-200 bg-rose-50 text-rose-700",
  postponed: "border-orange-200 bg-orange-50 text-orange-700",
  cancelled: "border-slate-200 bg-slate-100 text-slate-600",
  applied: "border-teal-200 bg-teal-50 text-teal-700",
  closed: "border-zinc-200 bg-zinc-100 text-zinc-700",
};

export function EmployeeRequestStatusBadge({ status }: { status?: string | null }) {
  const key = status || "";
  const color = STATUS_CLASS[key] || "border-slate-200 bg-white text-slate-700";
  return (
    <span className={"inline-flex rounded-full border px-2.5 py-1 text-xs font-black " + color}>
      {employeeRequestStatusLabel(status)}
    </span>
  );
}

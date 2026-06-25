import { employeeRequestTypeLabel } from "./employeeRequestLabels";

const TYPE_CLASS: Record<string, string> = {
  holiday_work: "border-violet-200 bg-violet-50 text-violet-700",
  vacation: "border-cyan-200 bg-cyan-50 text-cyan-700",
  personal_permission: "border-blue-200 bg-blue-50 text-blue-700",
  overtime: "border-amber-200 bg-amber-50 text-amber-700",
  shift_change: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
  schedule_change: "border-purple-200 bg-purple-50 text-purple-700",
  early_leave: "border-orange-200 bg-orange-50 text-orange-700",
  late_arrival: "border-red-200 bg-red-50 text-red-700",
  absence: "border-slate-200 bg-slate-50 text-slate-700",
  other: "border-zinc-200 bg-zinc-50 text-zinc-700",
};

export function EmployeeRequestTypeBadge({ type }: { type?: string | null }) {
  const key = type || "";
  const color = TYPE_CLASS[key] || "border-slate-200 bg-white text-slate-700";
  return (
    <span className={"inline-flex rounded-full border px-2.5 py-1 text-xs font-black " + color}>
      {employeeRequestTypeLabel(type)}
    </span>
  );
}

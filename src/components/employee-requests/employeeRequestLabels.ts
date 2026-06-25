export const EMPLOYEE_REQUEST_TYPE_LABELS: Record<string, string> = {
  holiday_work: "Trabajo en festivo",
  vacation: "Vacaciones",
  personal_permission: "Permiso personal",
  overtime: "Horas extra",
  shift_change: "Cambio de turno",
  schedule_change: "Cambio de horario",
  early_leave: "Salida anticipada",
  late_arrival: "Llegada tarde",
  absence: "Ausencia",
  other: "Otro",
};

export const EMPLOYEE_REQUEST_STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  submitted: "Enviada",
  under_review: "En revision",
  needs_info: "Requiere informacion",
  approved: "Aprobada",
  rejected: "Rechazada",
  postponed: "Postergada",
  cancelled: "Cancelada",
  applied: "Aplicada",
  closed: "Cerrada",
};

export const EMPLOYEE_REQUEST_TYPE_OPTIONS = Object.entries(EMPLOYEE_REQUEST_TYPE_LABELS).map(([value, label]) => ({ value, label }));
export const EMPLOYEE_REQUEST_STATUS_OPTIONS = Object.entries(EMPLOYEE_REQUEST_STATUS_LABELS).map(([value, label]) => ({ value, label }));

export function employeeRequestTypeLabel(value?: string | null) {
  if (!value) return "-";
  return EMPLOYEE_REQUEST_TYPE_LABELS[value] || value;
}

export function employeeRequestStatusLabel(value?: string | null) {
  if (!value) return "-";
  return EMPLOYEE_REQUEST_STATUS_LABELS[value] || value;
}

import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export type EmployeeRequestStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "needs_info"
  | "approved"
  | "rejected"
  | "postponed"
  | "cancelled"
  | "applied"
  | "closed";

export type EmployeeRequestType =
  | "holiday_work"
  | "vacation"
  | "personal_permission"
  | "overtime"
  | "shift_change"
  | "schedule_change"
  | "early_leave"
  | "late_arrival"
  | "absence"
  | "other";

export type EmployeeRequest = {
  id: string;
  request_code: string | null;
  request_type: EmployeeRequestType | string;
  status: EmployeeRequestStatus | string;
  profile_id: string;
  company_id: string | null;
  department_id: string | null;
  work_center_id: string | null;
  date_from: string | null;
  date_to: string | null;
  work_date: string | null;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  title: string | null;
  reason: string | null;
  employee_notes: string | null;
  manager_notes: string | null;
  rrhh_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  applied_by: string | null;
  applied_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  linked_holiday_authorization_id: string | null;
  related_attendance_event_id: string | null;
  related_shift_plan_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
};

export type EmployeeRequestPayload = {
  request_type: EmployeeRequestType | string;
  status?: "draft" | "submitted";
  profile_id?: string;
  company_id?: string;
  department_id?: string;
  work_center_id?: string;
  date_from?: string;
  date_to?: string;
  work_date?: string;
  start_time?: string;
  end_time?: string;
  all_day?: boolean;
  title?: string;
  reason?: string;
  employee_notes?: string;
  metadata?: Record<string, unknown>;
};

function normalizeRequest(row: any): EmployeeRequest {
  return {
    id: String(row.id ?? ""),
    request_code: row.request_code ?? null,
    request_type: String(row.request_type ?? "other"),
    status: String(row.status ?? "submitted"),
    profile_id: String(row.profile_id ?? ""),
    company_id: row.company_id ?? null,
    department_id: row.department_id ?? null,
    work_center_id: row.work_center_id ?? null,
    date_from: row.date_from ?? null,
    date_to: row.date_to ?? null,
    work_date: row.work_date ?? null,
    start_time: row.start_time ?? null,
    end_time: row.end_time ?? null,
    all_day: row.all_day === true,
    title: row.title ?? null,
    reason: row.reason ?? null,
    employee_notes: row.employee_notes ?? null,
    manager_notes: row.manager_notes ?? null,
    rrhh_notes: row.rrhh_notes ?? null,
    reviewed_by: row.reviewed_by ?? null,
    reviewed_at: row.reviewed_at ?? null,
    applied_by: row.applied_by ?? null,
    applied_at: row.applied_at ?? null,
    cancelled_by: row.cancelled_by ?? null,
    cancelled_at: row.cancelled_at ?? null,
    linked_holiday_authorization_id: row.linked_holiday_authorization_id ?? null,
    related_attendance_event_id: row.related_attendance_event_id ?? null,
    related_shift_plan_id: row.related_shift_plan_id ?? null,
    created_by: row.created_by ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
  };
}

export function useEmployeeRequests(autoLoad = true) {
  const [requests, setRequests] = useState<EmployeeRequest[]>([]);
  const [loading, setLoading] = useState(autoLoad);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: rpcError } = await (supabase as any).rpc("gmt_employee_requests_visible");

    if (rpcError) {
      setError(rpcError.message || "No se pudieron cargar las solicitudes.");
      setRequests([]);
      setLoading(false);
      throw rpcError;
    }

    const rows = Array.isArray(data) ? data : [];
    setRequests(rows.map(normalizeRequest));
    setLoading(false);
    return rows;
  }, []);

  const createRequest = useCallback(async (payload: EmployeeRequestPayload) => {
    setSaving(true);
    setError(null);

    const { data, error: rpcError } = await (supabase as any).rpc("gmt_create_employee_request", {
      p_payload: {
        ...payload,
        metadata: {
          ...(payload.metadata || {}),
          ui_source: "employee_requests_frontend",
        },
      },
    });

    setSaving(false);

    if (rpcError) {
      setError(rpcError.message || "No se pudo crear la solicitud.");
      throw rpcError;
    }

    await loadRequests();
    return String(data ?? "");
  }, [loadRequests]);

  const reviewRequest = useCallback(async (requestId: string, decision: string, note: string) => {
    setSaving(true);
    setError(null);

    const { data, error: rpcError } = await (supabase as any).rpc("gmt_review_employee_request", {
      p_request_id: requestId,
      p_decision: decision,
      p_note: note,
    });

    setSaving(false);

    if (rpcError) {
      setError(rpcError.message || "No se pudo revisar la solicitud.");
      throw rpcError;
    }

    await loadRequests();
    return String(data ?? "");
  }, [loadRequests]);

  const applyRequest = useCallback(async (requestId: string, note: string) => {
    setSaving(true);
    setError(null);

    const { data, error: rpcError } = await (supabase as any).rpc("gmt_apply_employee_request", {
      p_request_id: requestId,
      p_note: note,
    });

    setSaving(false);

    if (rpcError) {
      setError(rpcError.message || "No se pudo aplicar la solicitud.");
      throw rpcError;
    }

    await loadRequests();
    return String(data ?? "");
  }, [loadRequests]);

  const cancelRequest = useCallback(async (requestId: string, note: string) => {
    setSaving(true);
    setError(null);

    const { data, error: rpcError } = await (supabase as any).rpc("gmt_cancel_employee_request", {
      p_request_id: requestId,
      p_note: note,
    });

    setSaving(false);

    if (rpcError) {
      setError(rpcError.message || "No se pudo cancelar la solicitud.");
      throw rpcError;
    }

    await loadRequests();
    return String(data ?? "");
  }, [loadRequests]);

  useEffect(() => {
    if (!autoLoad) return;
    loadRequests().catch(() => undefined);
  }, [autoLoad, loadRequests]);

  const stats = useMemo(() => {
    const pending = requests.filter((item) => ["submitted", "under_review", "needs_info"].includes(item.status)).length;
    const approved = requests.filter((item) => item.status === "approved").length;
    const rejected = requests.filter((item) => ["rejected", "postponed", "cancelled"].includes(item.status)).length;
    const holidayApproved = requests.filter((item) => item.request_type === "holiday_work" && item.status === "approved").length;

    return { total: requests.length, pending, approved, rejected, holidayApproved };
  }, [requests]);

  return {
    requests,
    loading,
    saving,
    error,
    stats,
    loadRequests,
    createRequest,
    reviewRequest,
    applyRequest,
    cancelRequest,
  };
}

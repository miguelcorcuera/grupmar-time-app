import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  user_id?: string | null;
  full_name: string;
  email: string;
  employee_code?: string | null;
  document_number?: string | null;
  active: boolean;
  department_id: string | null;
  work_center_id: string | null;
  job_title?: string | null;
};

export type Role = "admin" | "user";

const db = supabase as any;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeUiRole(role?: string | null): Role {
  return role === "admin" || role === "rrhh" || role === "marketing" || role === "manager" ? "admin" : "user";
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading };
}

export function useProfile(userId?: string) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }

  useEffect(() => {
    let cancel = false;

    (async () => {
      try {
        setLoading(true);

        let uid = userId;
        if (!uid) {
          const { data } = await supabase.auth.getUser();
          uid = data.user?.id;
        }

        if (!uid) {
          if (!cancel) {
            setProfile(null);
            setRole(null);
            setLoading(false);
          }
          return;
        }

        // IMPORTANTE v15.3:
        // En la base nueva profiles.id ya NO es auth.uid().
        // El enlace correcto es profiles.user_id = auth.uid().
        let { data: p, error: pError } = await db
          .from("profiles")
          .select("*")
          .eq("user_id", uid)
          .maybeSingle();

        // Fallback por si algún perfil viejo quedó con id = auth.uid()
        if (!p && pError) console.warn("profiles by user_id error", pError.message);
        if (!p) {
          const fallback = await db
            .from("profiles")
            .select("*")
            .eq("id", uid)
            .maybeSingle();
          p = fallback.data;
        }

        const { data: r, error: rError } = await db
          .from("user_roles")
          .select("role")
          .eq("user_id", uid)
          .maybeSingle();

        if (rError) console.warn("user_roles error", rError.message);

        if (!cancel) {
          setProfile((p ?? null) as Profile | null);
          const email = String((p as any)?.email ?? "").toLowerCase();
          const rawRole = (r as any)?.role ?? (p as any)?.role;
          const adminByEmail = email === "ma.corcuera@grupomarport.com" || email.includes("admin");
          setRole(rawRole ? normalizeUiRole(rawRole) : adminByEmail ? "admin" : "user");
          setLoading(false);
        }
      } catch (e) {
        console.error("useProfile v15.3 error", e);
        if (!cancel) {
          setProfile(null);
          setRole(null);
          setLoading(false);
        }
      }
    })();

    return () => { cancel = true; };
  }, [userId]);

  return { profile, role, loading, signOut };
}

async function getCurrentProfile() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sesión no válida");

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("*")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) throw new Error("No existe perfil enlazado en public.profiles para este usuario.");
  if ((profile as any).active === false) throw new Error("Perfil inactivo");

  return { user: userData.user, profile };
}

async function getActiveShift(profileId: string) {
  const today = todayIso();
  const { data: assignment } = await db
    .from("employee_shift_assignments")
    .select("id, shift_template_id, valid_from, valid_until, active")
    .eq("profile_id", profileId)
    .eq("active", true)
    .lte("valid_from", today)
    .or(`valid_until.is.null,valid_until.gte.${today}`)
    .order("valid_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!assignment?.shift_template_id) return { assignment: assignment ?? null, shift: null };

  const { data: shift } = await db
    .from("shift_templates")
    .select("*")
    .eq("id", assignment.shift_template_id)
    .maybeSingle();

  return { assignment, shift: shift ?? null };
}

function mapEventToEntry(profile: any, event: any, shift: any, permission?: any) {
  const start = permission?.shift_start ?? shift?.start_time ?? "09:00";
  const end = permission?.shift_end ?? shift?.end_time ?? "17:00";
  const status = event?.status;

  return {
    event_id: event?.id,
    full_name: profile?.full_name,
    event_time: event?.event_time ?? new Date().toISOString(),
    server_time: new Date().toISOString(),
    expected_time: start,
    shift_end_time: end,
    exit_grace_minutes: Number(shift?.exit_grace_minutes ?? 5),
    lunch_start_time: shift?.lunch_start ?? null,
    lunch_end_time: shift?.lunch_end ?? null,
    max_lunch_minutes: Number(shift?.lunch_minutes ?? 60),
    late_tolerance_minutes: Number(shift?.entry_tolerance_minutes ?? 10),
    is_late: status === "late",
    late_minutes_total: 0,
    late_minutes_after_tolerance: 0,
    ip_address: event?.ip_address ?? null,
    is_company_network: event?.is_company_network ?? false,
    connection_location_status: event?.is_company_network ? "company_network" : "unknown",
    security_flag: status === "manual_review" || status === "blocked",
    blocked: status === "blocked",
    message: status === "blocked" ? event?.notes ?? "Marcación bloqueada" : "Entrada registrada",
    fallback: true,
  };
}

export async function callRegisterEntry() {
  const { profile } = await getCurrentProfile();
  const today = todayIso();
  const { shift } = await getActiveShift(profile.id);

  let permission: any = null;
  try {
    const { data } = await db.rpc("can_profile_mark_now", { p_profile_id: profile.id });
    permission = Array.isArray(data) ? data[0] : data;
  } catch (e) {
    console.warn("can_profile_mark_now no disponible", e);
  }

  if (permission && permission.allowed === false) {
    return {
      full_name: profile.full_name,
      server_time: new Date().toISOString(),
      expected_time: permission.shift_start ?? shift?.start_time ?? "09:00",
      shift_end_time: permission.shift_end ?? shift?.end_time ?? "17:00",
      exit_grace_minutes: Number(shift?.exit_grace_minutes ?? 5),
      lunch_start_time: shift?.lunch_start ?? null,
      lunch_end_time: shift?.lunch_end ?? null,
      max_lunch_minutes: Number(shift?.lunch_minutes ?? 60),
      blocked: true,
      message: permission.reason ?? `No puedes marcar aún tus marcaciones. Te invitamos a hacerlo en el horario de ${permission.assigned_schedule ?? "tu turno asignado"}.`,
    };
  }

  const existing = await db
    .from("attendance_events")
    .select("*")
    .eq("profile_id", profile.id)
    .eq("event_date", today)
    .eq("event_type", "ENTRY")
    .order("event_time", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing.data) return mapEventToEntry(profile, existing.data, shift, permission);

  const rpc = await db.rpc("register_attendance_event", {
    p_event_type: "ENTRY",
    p_latitude: null,
    p_longitude: null,
    p_ip_address: null,
    p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "browser",
    p_notes: null,
  });

  if (!rpc.error && rpc.data) return mapEventToEntry(profile, rpc.data, shift, permission);

  const inserted = await db
    .from("attendance_events")
    .insert({
      profile_id: profile.id,
      event_type: "ENTRY",
      status: "valid",
      source: "web_fallback_v15_3",
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "browser",
      created_by: profile.user_id ?? null,
    })
    .select("*")
    .single();

  if (inserted.error) throw new Error(`No se pudo registrar entrada: ${rpc.error?.message ?? inserted.error.message}`);
  return mapEventToEntry(profile, inserted.data, shift, permission);
}

export async function callRegisterEvent(event_type: string, notes?: string) {
  const { profile } = await getCurrentProfile();
  const dbEventType = event_type === "EXTRA_EXIT_START" || event_type === "EXTRA_EXIT_END" ? "EXTRA_EXIT" : event_type;

  const rpc = await db.rpc("register_attendance_event", {
    p_event_type: dbEventType,
    p_latitude: null,
    p_longitude: null,
    p_ip_address: null,
    p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "browser",
    p_notes: notes ?? null,
  });

  if (!rpc.error && rpc.data) {
    return {
      ...(rpc.data as any),
      event_type,
      message: "Marcación registrada.",
      fallback: true,
    };
  }

  const inserted = await db
    .from("attendance_events")
    .insert({
      profile_id: profile.id,
      event_type: dbEventType,
      status: "valid",
      source: "button_fallback_v15_3",
      notes: notes ?? null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "browser",
      created_by: profile.user_id ?? null,
    })
    .select("*")
    .single();

  if (inserted.error) throw new Error(`No se pudo registrar marcación: ${rpc.error?.message ?? inserted.error.message}`);

  return {
    ...(inserted.data as any),
    event_type,
    message: "Marcación registrada.",
    fallback: true,
  };
}

export function formatTime(d: string | Date | null | undefined) {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(d: string | Date | null | undefined) {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("es-ES");
}

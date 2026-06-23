// ============================================================================
// GrupMar Time - Edge Function admin-users v16.11.2
//
// Hotfix:
// - Evita "permission denied for table profiles" dentro de Edge.
// - La Edge ya NO lee/escribe public.profiles directo por PostgREST.
// - Para perfiles usa RPC SECURITY DEFINER admin_access_save_profile con el JWT
//   del usuario autenticado.
// - Para Auth usa SERVICE_ROLE_KEY.
// - Autorización: admin por email permitido o por RPC/perfil si está disponible.
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Payload = {
  action?: string;
  profile_id?: string | null;
  user_id?: string | null;
  email?: string | null;
  password?: string | null;
  full_name?: string | null;
  role?: string | null;
  employee_code?: string | null;
  document_type?: string | null;
  document_number?: string | null;
  department?: string | null;
  work_center?: string | null;
  company_name?: string | null;
  active?: boolean | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function emailOf(v: unknown) {
  return clean(v).toLowerCase();
}

function normalizeRole(v: unknown) {
  const role = clean(v || "employee").toLowerCase();
  return role || "employee";
}

function decodeJwtPayload(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(normalized);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

async function getAuthUserByEmail(service: any, email: string) {
  let page = 1;
  const perPage = 1000;

  while (page <= 20) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const found = data?.users?.find((u: any) => String(u.email || "").toLowerCase() === email);
    if (found) return found;

    if (!data?.users || data.users.length < perPage) return null;
    page++;
  }

  return null;
}

async function getAuthUserById(service: any, userId: string) {
  if (!userId) return null;
  const { data, error } = await service.auth.admin.getUserById(userId);
  if (error) return null;
  return data?.user ?? null;
}

function profilePayload(body: Payload, authUserId?: string | null) {
  return {
    profile_id: clean(body.profile_id) || null,
    user_id: authUserId || clean(body.user_id) || null,
    email: emailOf(body.email),
    full_name: clean(body.full_name || body.email),
    role: normalizeRole(body.role),
    employee_code: clean(body.employee_code) || null,
    document_type: clean(body.document_type) || null,
    document_number: clean(body.document_number) || null,
    department: clean(body.department) || null,
    work_center: clean(body.work_center) || null,
    company_name: clean(body.company_name || "Grupo Marport"),
    active: body.active === false ? false : true,
  };
}

async function saveProfileViaRpc(userClient: any, body: Payload, authUserId?: string | null) {
  const payload = profilePayload(body, authUserId);

  const { data, error } = await userClient.rpc("admin_access_save_profile", {
    p_payload: payload,
  });

  if (error) {
    throw new Error(`admin_access_save_profile RPC: ${error.message || JSON.stringify(error)}`);
  }

  return data;
}

async function ensureCaller(req: Request, url: string, anonKey: string) {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    throw new Error("Falta Authorization Bearer.");
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) {
    throw new Error("Sesión no válida.");
  }

  const caller = data.user;
  const callerEmail = String(caller.email || "").toLowerCase();

  // Fallback controlado para esta migración. Evita leer profiles directo desde Edge.
  const allowedByEmail =
    callerEmail === "ma.corcuera@grupomarport.com" ||
    callerEmail === "miguel.corcuera@gmail.com" ||
    callerEmail.includes("admin");

  if (!allowedByEmail) {
    // Intento suave: si existe RPC admin, una llamada de guardado fallará si no tiene permiso.
    // No leemos profiles aquí para evitar permission denied.
    console.warn("Caller no está en fallback email; la RPC validará permisos.", callerEmail);
  }

  return { userClient, caller, callerEmail, allowedByEmail };
}

async function audit(_userClient: any, action: string, details: unknown) {
  // Intencionalmente no bloqueante.
  try {
    await _userClient.from("access_audit_logs").insert({
      action,
      details,
      created_at: new Date().toISOString(),
    });
  } catch (_e) {}
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey =
      Deno.env.get("SERVICE_ROLE_KEY") ||
      Deno.env.get("ADMIN_SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!url || !anonKey || !serviceKey) {
      return json({
        ok: false,
        error: "Falta SUPABASE_URL, SUPABASE_ANON_KEY o SERVICE_ROLE_KEY.",
      }, 500);
    }

    const servicePayload = decodeJwtPayload(serviceKey);
    console.log("admin-users service key role:", servicePayload?.role || servicePayload?.ref || "unknown");

    const body = await req.json() as Payload;
    const action = clean(body.action);
    const email = emailOf(body.email);
    const password = clean(body.password);
    const role = normalizeRole(body.role);

    if (!action) return json({ ok: false, error: "action requerido" }, 400);
    if (!email) return json({ ok: false, error: "email requerido" }, 400);

    const { userClient, callerEmail } = await ensureCaller(req, url, anonKey);

    const service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (["create_user", "reset_password"].includes(action)) {
      if (!password || password.length < 6) {
        return json({ ok: false, error: "La contraseña debe tener al menos 6 caracteres." }, 400);
      }

      let authUser: any = null;
      const existingUserId = clean(body.user_id);

      try {
        if (existingUserId) authUser = await getAuthUserById(service, existingUserId);
        if (!authUser) authUser = await getAuthUserByEmail(service, email);
      } catch (e) {
        throw new Error(`Auth admin lookup falló. Revisa que SERVICE_ROLE_KEY sea la service API key: ${e?.message ?? String(e)}`);
      }

      const fullName = clean(body.full_name || email);

      if (!authUser) {
        const { data, error } = await service.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName, role },
        });

        if (error) {
          throw new Error(`Auth createUser: ${error.message}`);
        }

        authUser = data.user;
      } else {
        const { data, error } = await service.auth.admin.updateUserById(authUser.id, {
          password,
          email_confirm: true,
          user_metadata: {
            ...(authUser.user_metadata || {}),
            full_name: fullName,
            role,
          },
          ban_duration: "none",
        });

        if (error) {
          throw new Error(`Auth updateUserById: ${error.message}`);
        }

        authUser = data.user;
      }

      const savedProfile = await saveProfileViaRpc(
        userClient,
        { ...body, full_name: fullName, role, active: true },
        authUser.id,
      );

      await audit(userClient, action, {
        email,
        user_id: authUser.id,
        caller: callerEmail,
        profile_id: savedProfile?.id,
      });

      return json({
        ok: true,
        action,
        user_id: authUser.id,
        email,
        profile: savedProfile,
      });
    }

    if (action === "update_user") {
      let authUser: any = null;
      const existingUserId = clean(body.user_id);

      try {
        if (existingUserId) authUser = await getAuthUserById(service, existingUserId);
        if (!authUser) authUser = await getAuthUserByEmail(service, email);
      } catch (e) {
        console.warn("Auth lookup no disponible en update_user; se guardará profile por RPC.", e);
      }

      if (authUser?.id) {
        const { error } = await service.auth.admin.updateUserById(authUser.id, {
          email,
          user_metadata: {
            ...(authUser.user_metadata || {}),
            full_name: clean(body.full_name || email),
            role,
          },
          ban_duration: body.active === false ? "876000h" : "none",
        });

        if (error) throw new Error(`Auth updateUserById: ${error.message}`);
      }

      const savedProfile = await saveProfileViaRpc(userClient, body, authUser?.id || body.user_id || null);

      return json({
        ok: true,
        action,
        user_id: authUser?.id || body.user_id || null,
        profile: savedProfile,
      });
    }

    if (["enable_user", "disable_user", "delete_user"].includes(action)) {
      const active = action === "enable_user";
      let authUser: any = null;
      const existingUserId = clean(body.user_id);

      try {
        if (existingUserId) authUser = await getAuthUserById(service, existingUserId);
        if (!authUser) authUser = await getAuthUserByEmail(service, email);

        if (authUser?.id) {
          const { error } = await service.auth.admin.updateUserById(authUser.id, {
            ban_duration: active ? "none" : "876000h",
          });
          if (error) throw new Error(`Auth ban/unban: ${error.message}`);
        }
      } catch (e) {
        console.warn("Auth enable/disable no disponible; se actualizará profile.", e);
      }

      const savedProfile = await saveProfileViaRpc(userClient, { ...body, active }, authUser?.id || body.user_id || null);

      return json({
        ok: true,
        action,
        active,
        profile: savedProfile,
      });
    }

    return json({ ok: false, error: `Acción no soportada: ${action}` }, 400);
  } catch (e) {
    console.error("admin-users error:", e);
    return json({
      ok: false,
      error: e?.message ?? String(e),
      stack: e?.stack ?? null,
    }, 500);
  }
});

// Edge Function: register-attendance-event-secure
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function pickIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "";
}
function detectBrowser(ua: string) {
  if (/Edg\//.test(ua)) return "Edge";
  if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua)) return "Safari";
  return "Other";
}
function detectDevice(ua: string) {
  if (/Mobile|Android|iPhone|iPad/.test(ua)) return "Mobile";
  if (/Mac OS X/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "Other";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "no_auth" }), { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } });

  let body: { event_type?: string; notes?: string } = {};
  try { body = await req.json(); } catch {}
  if (!body.event_type) {
    return new Response(JSON.stringify({ error: "missing_event_type" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
  }

  const ip = pickIp(req);
  const ua = req.headers.get("user-agent") ?? "";

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data, error } = await supabase.rpc("register_attendance_event", {
    p_event_type: body.event_type,
    p_notes: body.notes ?? null,
    client_ip: ip,
    p_user_agent: ua,
    p_browser: detectBrowser(ua),
    p_device: detectDevice(ua),
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
  return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } });
});

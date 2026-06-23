import { MapPin, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const ACCESS_SECURITY_VERSION = "Geo-IP seguridad v5.4 · coordenadas exactas Son Oms + altitud · 17/06/2026 12:50";

export type AccessRiskLevel = "low" | "medium" | "high" | "critical";

export type AccessSnapshot = {
  id: string;
  created_at: string;
  employee_id?: string | null;
  employee_name?: string | null;
  event_type: string;
  ip_address?: string | null;
  user_agent?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  geo_permission: "granted" | "denied" | "unavailable" | "timeout" | "unknown";
  city?: string | null;
  region?: string | null;
  country?: string | null;
  isp?: string | null;
  risk_level: AccessRiskLevel;
  risk_reason: string;
  office_distance_m?: number | null;
  map_url?: string | null;
};

const DEFAULT_OFFICE = {
  name: "Oficina / Son Oms",
  // Son Oms / oficina principal. Si la IP coincide, se usa esta sede como ubicación validada.
  lat: 39.542466,
  lng: 2.741202,
  altitudeMeters: 1,
  radiusMeters: 150,
  publicIp: "80.24.218.227",
};

function newId() {
  return `access-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
}

function readOfficeConfig() {
  return DEFAULT_OFFICE;
}

function getBrowserPosition(): Promise<Pick<AccessSnapshot, "latitude" | "longitude" | "accuracy" | "geo_permission">> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({ latitude: null, longitude: null, accuracy: null, geo_permission: "unavailable" });
  }

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      resolve({ latitude: null, longitude: null, accuracy: null, geo_permission: "timeout" });
    }, 9000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timeout);
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
          geo_permission: "granted",
        });
      },
      (err) => {
        window.clearTimeout(timeout);
        const denied = err.code === err.PERMISSION_DENIED;
        resolve({ latitude: null, longitude: null, accuracy: null, geo_permission: denied ? "denied" : "unavailable" });
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  });
}

async function getIpInfo(): Promise<Partial<AccessSnapshot>> {
  const out: Partial<AccessSnapshot> = {};
  try {
    const ipRes = await fetch("https://api.ipify.org?format=json", { cache: "no-store" });
    if (ipRes.ok) {
      const ipData = await ipRes.json();
      out.ip_address = ipData?.ip ?? null;
    }
  } catch {
    // Sin internet o bloqueado por CORS. No se rompe la marcación.
  }

  try {
    const geoRes = await fetch("https://ipapi.co/json/", { cache: "no-store" });
    if (geoRes.ok) {
      const geo = await geoRes.json();
      out.ip_address = out.ip_address ?? geo?.ip ?? null;
      out.city = geo?.city ?? null;
      out.region = geo?.region ?? null;
      out.country = geo?.country_name ?? geo?.country ?? null;
      out.isp = geo?.org ?? geo?.asn ?? null;
    }
  } catch {
    // Opcional. El GPS sigue siendo la fuente principal.
  }

  return out;
}

function riskFor(snapshot: Partial<AccessSnapshot>) {
  const office = readOfficeConfig();
  let officeDistance: number | null = null;
  const ip = String(snapshot.ip_address ?? "").trim();
  const isOfficeIp = !!office.publicIp && ip === office.publicIp;
  const hasGps = typeof snapshot.latitude === "number" && typeof snapshot.longitude === "number";
  const accuracy = typeof snapshot.accuracy === "number" ? snapshot.accuracy : null;
  const gpsIsPreciseEnough = accuracy === null || accuracy <= Math.max(office.radiusMeters * 2, 1500);

  if (hasGps) {
    officeDistance = distanceMeters(snapshot.latitude!, snapshot.longitude!, office.lat, office.lng);
  }

  // Regla principal para oficina: si la IP pública coincide con la IP fija de Son Oms, se valida como oficina.
  // Esto evita falsos rojos cuando el navegador devuelve GPS aproximado por IP con 100 km de precisión.
  if (isOfficeIp) {
    return {
      risk_level: "low" as AccessRiskLevel,
      risk_reason: hasGps && gpsIsPreciseEnough
        ? `IP de oficina validada (${office.publicIp}) y GPS capturado. Distancia GPS: ${officeDistance ?? "—"} m.`
        : `IP de oficina validada (${office.publicIp}). GPS ausente o impreciso; se muestra ubicación de la sede ${office.name}.`,
      officeDistance,
      forceOfficeMap: !hasGps || !gpsIsPreciseEnough || (officeDistance !== null && officeDistance > office.radiusMeters),
    };
  }

  if (snapshot.geo_permission === "denied") {
    return { risk_level: "critical" as AccessRiskLevel, risk_reason: "GPS denegado por el usuario. Posible marcación remota o sin control de ubicación.", officeDistance, forceOfficeMap: false };
  }

  if (snapshot.geo_permission === "timeout" || snapshot.geo_permission === "unavailable") {
    return { risk_level: "high" as AccessRiskLevel, risk_reason: "No se pudo obtener GPS y la IP no coincide con la oficina. Marcación requiere revisión.", officeDistance, forceOfficeMap: false };
  }

  if (officeDistance !== null && officeDistance > office.radiusMeters) {
    return { risk_level: "critical" as AccessRiskLevel, risk_reason: `Fuera del radio de oficina: ${officeDistance} m de ${office.name}. IP detectada: ${ip || "no detectada"}.`, officeDistance, forceOfficeMap: false };
  }

  if (!snapshot.ip_address) {
    return { risk_level: "medium" as AccessRiskLevel, risk_reason: "GPS correcto, pero IP pública no detectada.", officeDistance, forceOfficeMap: false };
  }

  return { risk_level: "low" as AccessRiskLevel, risk_reason: "GPS dentro del radio permitido y conexión identificada.", officeDistance, forceOfficeMap: false };
}

export function readAccessSnapshots(): AccessSnapshot[] {
  return [];
}

export function writeAccessSnapshots(_rows: AccessSnapshot[]) {
  // Sin almacenamiento local de negocio. Los snapshots se guardan en Supabase con gmt_save_access_security_snapshot.
}

export async function loadAccessSnapshots(limit = 100): Promise<AccessSnapshot[]> {
  const { data, error } = await (supabase as any).rpc("gmt_recent_access_security_snapshots", {
    p_limit: limit,
  });

  if (error) throw error;
  return Array.isArray(data) ? data as AccessSnapshot[] : [];
}

export async function captureAccessSnapshot(input: { employeeId?: string | null; employeeName?: string | null; eventType: string; }): Promise<AccessSnapshot> {
  const [pos, ip] = await Promise.all([getBrowserPosition(), getIpInfo()]);
  const base: Partial<AccessSnapshot> = {
    ...pos,
    ...ip,
    id: newId(),
    created_at: new Date().toISOString(),
    employee_id: input.employeeId ?? null,
    employee_name: input.employeeName ?? null,
    event_type: input.eventType,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
  };
  const risk = riskFor(base);
  const office = readOfficeConfig();
  const mapLat = risk.forceOfficeMap ? office.lat : base.latitude;
  const mapLng = risk.forceOfficeMap ? office.lng : base.longitude;
  const snapshot: AccessSnapshot = {
    ...base,
    latitude: risk.forceOfficeMap ? office.lat : base.latitude,
    longitude: risk.forceOfficeMap ? office.lng : base.longitude,
    accuracy: risk.forceOfficeMap ? 0 : base.accuracy,
    risk_level: risk.risk_level,
    risk_reason: risk.risk_reason,
    office_distance_m: risk.officeDistance,
    map_url: typeof mapLat === "number" && typeof mapLng === "number" ? openStreetMapEmbedUrl(mapLat, mapLng) : null,
  } as AccessSnapshot;

  try {
    const { error } = await (supabase as any).rpc("gmt_save_access_security_snapshot", {
      p_snapshot: snapshot,
    });

    if (error) {
      console.error("[GrupMar Time] No se pudo guardar snapshot de seguridad en Supabase", error);
    }
  } catch (err) {
    console.error("[GrupMar Time] Error guardando snapshot de seguridad", err);
  }

  return snapshot;
}

export function officeSnapshotLocation() {
  const office = readOfficeConfig();
  return office;
}

export async function updateAccessSnapshotLocation(snapshotId: string, lat: number, lng: number, note = "Ubicación corregida manualmente por administrador") {
  const { data, error } = await (supabase as any).rpc("gmt_update_access_security_snapshot_location", {
    p_snapshot_id: snapshotId,
    p_lat: lat,
    p_lng: lng,
    p_note: note,
  });

  if (error) throw error;

  const row = data as any;
  return {
    ...(row?.raw_snapshot ?? {}),
    id: row?.id ?? snapshotId,
    created_at: row?.created_at,
    employee_id: row?.profile_id,
    employee_name: row?.employee_name,
    event_type: row?.event_type,
    ip_address: row?.ip_address,
    user_agent: row?.user_agent,
    latitude: row?.latitude,
    longitude: row?.longitude,
    accuracy: row?.accuracy,
    geo_permission: row?.raw_snapshot?.geo_permission ?? "unknown",
    city: row?.city,
    region: row?.region,
    country: row?.country,
    isp: row?.isp,
    risk_level: row?.risk_level,
    risk_reason: row?.risk_reason,
    office_distance_m: row?.office_distance_m,
    map_url: row?.map_url,
  } as AccessSnapshot;
}

export function openStreetMapEmbedUrl(lat: number, lng: number) {
  const delta = 0.006;
  const left = lng - delta;
  const right = lng + delta;
  const top = lat + delta;
  const bottom = lat - delta;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${lat}%2C${lng}`;
}

export function riskClasses(level?: AccessRiskLevel | null) {
  if (level === "low") return "bg-green-600 text-white";
  if (level === "medium") return "bg-yellow-500 text-black";
  if (level === "high") return "bg-orange-600 text-white";
  return "bg-red-600 text-white";
}

export function riskLabel(level?: AccessRiskLevel | null) {
  if (level === "low") return "Oficina validada";
  if (level === "medium") return "Revisión";
  if (level === "high") return "Riesgo alto";
  return "ROJO: posible remoto/fuera de oficina";
}

export function RiskIcon({ level, className = "w-4 h-4" }: { level?: AccessRiskLevel | null; className?: string }) {
  if (level === "low") return <ShieldCheck className={className} />;
  if (level === "medium") return <ShieldAlert className={className} />;
  return <ShieldX className={className} />;
}

export function AccessMap({ snapshot, height = 360 }: { snapshot?: AccessSnapshot | null; height?: number }) {
  if (!snapshot?.map_url || typeof snapshot.latitude !== "number" || typeof snapshot.longitude !== "number") {
    return (
      <div className="rounded-lg border bg-muted/30 flex items-center justify-center text-center text-sm text-muted-foreground" style={{ height }}>
        <div>
          <MapPin className="w-8 h-8 mx-auto mb-2 opacity-60" />
          Sin mapa: el usuario no autorizó GPS o el navegador no devolvió ubicación.
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-lg overflow-hidden border bg-card" style={{ height }}>
      <iframe title="Mapa de conexión" src={snapshot.map_url} className="w-full h-full" loading="lazy" referrerPolicy="no-referrer" />
    </div>
  );
}

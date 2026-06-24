import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, RefreshCw, Save, Search, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type AccessProfile = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  active: boolean;
  module_permissions: Record<string, boolean>;
};

type PermissionDefinition = {
  key: string;
  label: string;
  group: string;
  help: string;
};

const PERMISSIONS: PermissionDefinition[] = [
  { key: "admin.dashboard", label: "Dashboard", group: "Panel admin", help: "Resumen general del panel administrador." },
  { key: "admin.attendance", label: "Marcaciones", group: "Tiempo", help: "Registros, mapa y control de marcaciones." },
  { key: "admin.shifts", label: "Turnos", group: "Tiempo", help: "Planificador de turnos y horarios." },
  { key: "admin.reports", label: "Informes", group: "Reportes", help: "Balances mensuales y reportes." },

  { key: "admin.checkin_messages", label: "Comunicados", group: "Comunicación", help: "Marquesina y comunicados antes de fichar." },
  { key: "admin.informativo", label: "Informativo", group: "Comunicación", help: "Noticias internas e informativo." },
  { key: "admin.celebrations", label: "Celebraciones", group: "Comunicación", help: "Festivos, santoral y celebraciones." },

  { key: "admin.access_maintenance", label: "Mantenimiento", group: "Mantenimiento", help: "Entrada al mantenimiento general." },
  { key: "maintenance.users", label: "Usuarios", group: "Mantenimiento", help: "Gestionar personal y usuarios." },
  { key: "maintenance.passwords", label: "Claves", group: "Mantenimiento", help: "Crear o resetear claves." },
  { key: "maintenance.roles", label: "Roles técnicos", group: "Mantenimiento", help: "Gestionar roles técnicos base." },
  { key: "maintenance.celebrations", label: "Mant. celebraciones", group: "Mantenimiento", help: "Editar festivos, santoral y celebraciones." },
  { key: "maintenance.area_permissions", label: "Perfiles acceso", group: "Mantenimiento", help: "Administrar matriz de permisos." },

  { key: "admin.alerts", label: "Alertas", group: "Control", help: "Incidencias y alertas." },
  { key: "admin.security", label: "Seguridad", group: "Control", help: "Geo-IP, riesgos y auditoría." },
  { key: "admin.letters", label: "Cartas", group: "Laboral", help: "Cartas y amonestaciones." },
  { key: "admin.settings", label: "Configuración", group: "Sistema", help: "Reglas generales y configuración." },
];

const EMPTY_EDITOR = {
  id: "",
  name: "",
  code: "",
  description: "",
  active: true,
};

function normalizeProfile(row: any): AccessProfile {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    code: String(row.code ?? ""),
    description: row.description ?? "",
    active: row.active !== false,
    module_permissions: row.module_permissions && typeof row.module_permissions === "object" ? row.module_permissions : {},
  };
}

function sanitizeCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function AccessProfilesMatrix() {
  const { toast } = useToast();

  const [profiles, setProfiles] = useState<AccessProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editor, setEditor] = useState(EMPTY_EDITOR);

  async function loadProfiles() {
    setLoading(true);

    const { data, error } = await (supabase as any)
      .from("access_profiles")
      .select("id,name,code,description,active,module_permissions")
      .order("name", { ascending: true });

    if (error) {
      toast({ title: "Error cargando perfiles", description: error.message || String(error), variant: "destructive" });
      setProfiles([]);
      setLoading(false);
      return;
    }

    setProfiles((data || []).map(normalizeProfile));
    setLoading(false);
  }

  useEffect(() => {
    loadProfiles();
  }, []);

  const groupedPermissions = useMemo(() => {
    return PERMISSIONS.reduce<Record<string, PermissionDefinition[]>>((acc, permission) => {
      acc[permission.group] = acc[permission.group] || [];
      acc[permission.group].push(permission);
      return acc;
    }, {});
  }, []);

  const filteredProfiles = useMemo(() => {
    const q = query.trim().toLowerCase();

    return profiles.filter((profile) => {
      if (!showInactive && !profile.active) return false;
      if (!q) return true;

      return [
        profile.name,
        profile.code,
        profile.description || "",
        JSON.stringify(profile.module_permissions || {}),
      ].join(" ").toLowerCase().includes(q);
    });
  }, [profiles, query, showInactive]);

  async function togglePermission(profile: AccessProfile, permissionKey: string, checked: boolean) {
    const current = { ...(profile.module_permissions || {}) };

    if (checked) current[permissionKey] = true;
    else delete current[permissionKey];

    const stateKey = `${profile.id}:${permissionKey}`;
    setSavingKey(stateKey);

    setProfiles((prev) =>
      prev.map((item) =>
        item.id === profile.id ? { ...item, module_permissions: current } : item
      )
    );

    const { error } = await (supabase as any)
      .from("access_profiles")
      .update({
        module_permissions: current,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    setSavingKey(null);

    if (error) {
      toast({ title: "Error guardando permiso", description: error.message || String(error), variant: "destructive" });
      await loadProfiles();
      return;
    }

    toast({
      title: checked ? "Permiso activado" : "Permiso desactivado",
      description: `${profile.name} · ${permissionKey}`,
    });
  }

  function openNewProfile() {
    setEditor(EMPTY_EDITOR);
    setEditorOpen(true);
  }

  function openEditProfile(profile: AccessProfile) {
    setEditor({
      id: profile.id,
      name: profile.name,
      code: profile.code,
      description: profile.description || "",
      active: profile.active,
    });
    setEditorOpen(true);
  }

  async function saveProfile() {
    const name = editor.name.trim();
    const code = sanitizeCode(editor.code || editor.name);

    if (!name || !code) {
      toast({ title: "Faltan datos", description: "El perfil necesita nombre y código.", variant: "destructive" });
      return;
    }

    const payload = {
      name,
      code,
      description: editor.description.trim() || null,
      active: editor.active,
      updated_at: new Date().toISOString(),
    };

    const { error } = editor.id
      ? await (supabase as any).from("access_profiles").update(payload).eq("id", editor.id)
      : await (supabase as any).from("access_profiles").insert({
          ...payload,
          module_permissions: {},
        });

    if (error) {
      toast({ title: "Error guardando perfil", description: error.message || String(error), variant: "destructive" });
      return;
    }

    toast({ title: "Perfil guardado", description: "El perfil de acceso quedó actualizado." });
    setEditorOpen(false);
    await loadProfiles();
  }

  const activeCount = profiles.filter((profile) => profile.active).length;
  const inactiveCount = profiles.length - activeCount;

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Seguridad</p>
            <h2 className="text-xl font-black text-slate-950">Perfiles de acceso</h2>
            <p className="text-sm text-slate-500">
              Administración nodular por perfil. Compacta, adaptable y sin scroll horizontal.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700"><b>{activeCount}</b> activos</div>
            <div className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-600"><b>{inactiveCount}</b> inactivos</div>
            <div className="rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-700"><b>{filteredProfiles.length}</b> visibles</div>
            <Button variant="outline" onClick={loadProfiles} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Actualizar
            </Button>
            <Button onClick={openNewProfile}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo perfil
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar perfil: empleado, marketing, rrhh, coordinador..."
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2">
            <Label className="text-sm">Mostrar inactivos</Label>
            <Switch checked={showInactive} onCheckedChange={setShowInactive} />
          </div>
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        {filteredProfiles.map((profile) => {
          const enabledCount = Object.values(profile.module_permissions || {}).filter(Boolean).length;

          return (
            <article key={profile.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <header className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/80 p-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-black text-slate-950">{profile.name || "Perfil sin nombre"}</h3>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-500">{profile.code || "sin_codigo"}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{profile.description || "Sin descripción"}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className={profile.active ? "rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700" : "rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-500"}>
                      {profile.active ? "Activo" : "Inactivo"}
                    </span>
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-black text-blue-700">
                      {enabledCount} permisos
                    </span>
                  </div>
                </div>

                <Button variant="outline" size="sm" onClick={() => openEditProfile(profile)}>
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Editar
                </Button>
              </header>

              <div className="grid gap-2 p-3 md:grid-cols-2 2xl:grid-cols-3">
                {Object.entries(groupedPermissions).map(([group, permissions]) => (
                  <div key={group} className="rounded-xl border border-slate-100 bg-white p-2">
                    <div className="mb-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{group}</div>

                    <div className="space-y-1">
                      {permissions.map((permission) => {
                        const checked = Boolean((profile.module_permissions || {})[permission.key]);
                        const key = `${profile.id}:${permission.key}`;
                        const saving = savingKey === key;

                        return (
                          <label
                            key={permission.key}
                            title={permission.help}
                            className={checked ? "flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 shadow-sm" : "flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5 hover:bg-slate-100"}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-black text-slate-800">{permission.label}</span>
                              <span className="block truncate font-mono text-[10px] text-slate-400">{permission.key}</span>
                            </span>

                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={saving}
                              onChange={(event) => togglePermission(profile, permission.key, event.target.checked)}
                              className="h-3.5 w-3.5 shrink-0 accent-slate-950"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          );
        })}

        {!filteredProfiles.length ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 xl:col-span-2">
            {loading ? "Cargando perfiles..." : "No hay perfiles para mostrar."}
          </div>
        ) : null}
      </section>

      {editorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Perfil de acceso</div>
                <h3 className="text-xl font-black text-slate-950">{editor.id ? "Editar perfil" : "Nuevo perfil"}</h3>
                <p className="text-sm text-slate-500">Los permisos se administran en la vista principal.</p>
              </div>
              <Button variant="outline" size="icon" onClick={() => setEditorOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nombre del perfil</Label>
                <Input value={editor.name} onChange={(event) => setEditor((prev) => ({ ...prev, name: event.target.value }))} placeholder="Marketing, Laboral, Coordinador..." />
              </div>

              <div className="space-y-2">
                <Label>Código técnico</Label>
                <Input value={editor.code} onChange={(event) => setEditor((prev) => ({ ...prev, code: sanitizeCode(event.target.value) }))} placeholder="marketing, laboral_rrhh..." />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Descripción</Label>
                <Textarea value={editor.description} onChange={(event) => setEditor((prev) => ({ ...prev, description: event.target.value }))} placeholder="Qué puede hacer este perfil..." />
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 px-3 py-2">
                <Switch checked={editor.active} onCheckedChange={(checked) => setEditor((prev) => ({ ...prev, active: checked }))} />
                <span className="text-sm text-slate-600">{editor.active ? "Perfil activo" : "Perfil inactivo"}</span>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancelar</Button>
              <Button onClick={saveProfile}>
                <Save className="mr-2 h-4 w-4" />
                Guardar perfil
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

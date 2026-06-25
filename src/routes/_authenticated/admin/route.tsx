import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import "@/styles/grupmar-bizneo.css";
import { ADMIN_BUILD_VERSION } from "@/lib/grupmarAdminLocal";
import { applySavedUserTheme } from "@/lib/grupmarUserTheme";
import {
  BarChart3,
  Bell,
  CalendarClock,
  CalendarDays,
  Clock,
  FileText,
  KeyRound,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  Newspaper,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Shield,
  WandSparkles,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({ component: AdminLayout });

type AdminPermission =
  | "admin.dashboard"
  | "admin.attendance"
  | "admin.shifts"
  | "admin.access_maintenance"
  | "admin.reports"
  | "admin.checkin_messages"
  | "admin.informativo"
  | "admin.alerts"
  | "admin.security"
  | "admin.letters"
  | "admin.settings"
  | "admin.celebrations"
  | "staff_requests.view_team";

type PermissionMap = Record<string, boolean>;

const links = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, hint: "Resumen general", permission: "admin.dashboard" },
  { to: "/admin/attendance", label: "Marcaciones", icon: Clock, hint: "Registros y mapa", permission: "admin.attendance" },
  { to: "/admin/shifts", label: "Planificador", icon: CalendarClock, hint: "Turnos dia/semana/mes", permission: "admin.shifts" },
  { to: "/admin/access-maintenance", label: "Mantenimiento", icon: KeyRound, hint: "Usuarios, claves y permisos", permission: "admin.access_maintenance" },

  { to: "/admin/reports", label: "Informes", icon: BarChart3, hint: "Balance mensual", permission: "admin.reports" },
  { to: "/admin/employee-requests", label: "Solicitudes", icon: FileText, hint: "Personal y permisos", permission: "staff_requests.view_team" },
  { to: "/admin/checkin-messages", label: "Comunicados", icon: WandSparkles, hint: "Vista al fichar", permission: "admin.checkin_messages" },
  { to: "/admin/informativo", label: "Informativo", icon: Newspaper, hint: "Noticias internas", permission: "admin.informativo" },
  { to: "/admin/celebrations", label: "Celebraciones", icon: CalendarDays, hint: "Cumpleaños, santos y festivos", permission: "admin.celebrations" },
  { to: "/admin/alerts", label: "Alertas", icon: Bell, hint: "Incidencias", permission: "admin.alerts" },
  { to: "/admin/security", label: "Seguridad", icon: Shield, hint: "Geo-IP y riesgos", permission: "admin.security" },
  { to: "/admin/letters", label: "Cartas", icon: FileText, hint: "Amonestaciones", permission: "admin.letters" },
  { to: "/admin/settings", label: "Configuracion", icon: Settings, hint: "Reglas y oficina", permission: "admin.settings" },
] as const;

const ALL_ADMIN_PERMISSIONS = links.map((l) => l.permission);

function hasPermission(permissions: PermissionMap, permission: string, superAdmin: boolean) {
  return superAdmin || permissions?.[permission] === true;
}

function permissionForPath(pathname: string): AdminPermission | null {
  const clean = pathname.replace(/\/+$/, "") || "/admin";

  if (clean === "/admin") return "admin.dashboard";
  if (clean === "/admin/attendance") return "admin.attendance";
  if (clean === "/admin/shifts") return "admin.shifts";
  if (clean === "/admin/access-maintenance") return "admin.access_maintenance";
  if (clean === "/admin/reports") return "admin.reports";
  if (clean === "/admin/employee-requests") return "staff_requests.view_team";
  if (clean === "/admin/checkin-messages") return "admin.checkin_messages";
  if (clean === "/admin/informativo") return "admin.informativo";
  if (clean === "/admin/celebrations") return "admin.celebrations";
  if (clean === "/admin/alerts") return "admin.alerts";
  if (clean === "/admin/security") return "admin.security";
  if (clean === "/admin/letters") return "admin.letters";
  if (clean === "/admin/settings") return "admin.settings";
  if (clean === "/admin/access") return "admin.security";
  if (clean === "/admin/employees" || clean.startsWith("/admin/employees/")) return "admin.access_maintenance";

  return null;
}

function AdminLayout() {
  useEffect(() => { applySavedUserTheme(); }, []);

  const location = useLocation();

  const [access, setAccess] = useState<{
    loading: boolean;
    allowed: boolean;
    superAdmin: boolean;
    permissions: PermissionMap;
    email?: string | null;
  }>({
    loading: true,
    allowed: false,
    superAdmin: false,
    permissions: {},
    email: null,
  });

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("grupmar_admin_sidebar_collapsed") === "1";
  });

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("grupmar_admin_sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data: u } = await supabase.auth.getUser();

      if (!u.user) {
        if (alive) {
          setAccess({
            loading: false,
            allowed: false,
            superAdmin: false,
            permissions: {},
            email: null,
          });
        }
        return;
      }

      const email = u.user.email ?? null;

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id)
        .eq("role", "admin")
        .maybeSingle();

      const emailBypass = /miguel|admin/i.test(email ?? "");
      const superAdmin = !!roleData || emailBypass;

      if (superAdmin) {
        const allPermissions = Object.fromEntries(ALL_ADMIN_PERMISSIONS.map((p) => [p, true]));

        if (alive) {
          setAccess({
            loading: false,
            allowed: true,
            superAdmin: true,
            permissions: allPermissions,
            email,
          });
        }
        return;
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("access_profile_id")
        .eq("user_id", u.user.id)
        .maybeSingle();

      const accessProfileId = (profileData as any)?.access_profile_id;

      let permissions: PermissionMap = {};

      if (accessProfileId) {
        const { data: accessProfileData, error: accessProfileError } = await (supabase as any)
          .from("access_profiles")
          .select("module_permissions")
          .eq("id", accessProfileId)
          .eq("active", true)
          .maybeSingle();

        if (accessProfileError) {
          console.warn("access_profiles.module_permissions error", accessProfileError.message);
        }

        permissions = ((accessProfileData as any)?.module_permissions ?? {}) as PermissionMap;
      }

      const allowed = ALL_ADMIN_PERMISSIONS.some((p) => permissions?.[p] === true);

      if (alive) {
        setAccess({
          loading: false,
          allowed,
          superAdmin: false,
          permissions,
          email,
        });
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const visibleLinks = useMemo(() => {
    return links.filter((l) => hasPermission(access.permissions, l.permission, access.superAdmin));
  }, [access.permissions, access.superAdmin]);

  const currentPermission = permissionForPath(location.pathname);
  const currentRouteAllowed = !currentPermission || hasPermission(access.permissions, currentPermission, access.superAdmin);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }

  if (access.loading) {
    return (
      <div className="gmt-shell">
        <div className="m-auto gmt-panel">
          <div className="gmt-pill">Cargando GrupMar Time...</div>
        </div>
      </div>
    );
  }

  if (!access.allowed) {
    return (
      <div className="gmt-shell">
        <div className="m-auto gmt-panel max-w-lg">
          <div className="gmt-pill">Acceso restringido</div>
          <h1 className="gmt-title text-2xl mt-4">Panel administrador</h1>
          <p className="gmt-subtitle">Tu usuario no tiene permisos administrativos asignados por rol o departamento.</p>
          <Link to="/" className="gmt-navlink mt-4">
            <Home className="w-4 h-4" /> <span>Volver a mi jornada</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="gmt-shell">
      <aside className={`gmt-admin-sidebar-fixed gmt-sidebar ${sidebarCollapsed ? "gmt-sidebar-collapsed" : ""}`}>
        <div className="gmt-brand">
          <Link to="/admin" className="gmt-brand-lockup" title="grup mar.time">
            <img src="/grupmar-time-brand.png?v=1640" alt="grup mar.time" className="gmt-brand-wordmark" />
            <img src="/grupmar-time-icon.png?v=1640" alt="grup mar.time" className="gmt-brand-symbol-only" />
          </Link>
          <button
            type="button"
            onClick={toggleSidebar}
            className="gmt-collapse-btn"
            title={sidebarCollapsed ? "Mostrar menu" : "Ocultar menu"}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        <div className="gmt-side-section">
          <div className="gmt-side-title">Tiempo</div>
          {visibleLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              activeOptions={{ exact: l.to === "/admin" }}
              className="gmt-navlink"
              activeProps={{ className: "gmt-navlink gmt-navlink-active" }}
              title={l.hint}
            >
              <l.icon className="w-4 h-4" />
              <span>{l.label}</span>
            </Link>
          ))}
        </div>

        <div className="gmt-side-section">
          <div className="gmt-side-title">Usuario</div>
          <Link to="/" className="gmt-navlink">
            <Home className="w-4 h-4" />
            <span>Mi horario</span>
          </Link>
          <button onClick={signOut} className="gmt-navlink w-full text-left">
            <LogOut className="w-4 h-4" />
            <span>Salir</span>
          </button>
        </div>

        <div className="mt-6 rounded-3xl border border-blue-100 bg-blue-50/70 p-4 text-xs text-blue-900">
          <div className="font-black mb-1 flex items-center gap-2"><WandSparkles className="w-4 h-4" /> Estetica aplicada</div>
          <div>{ADMIN_BUILD_VERSION}</div>
        </div>
      </aside>

      <main className="gmt-admin-main-fixed-offset gmt-main">
        <header className="gmt-topbar">
          <div className="gmt-top-tabs">
            <span className="gmt-top-tab gmt-top-tab-active">Tiempo</span>
            <span className="gmt-top-tab">Mi horario</span>
            <span className="gmt-top-tab">Mi equipo</span>
            <span className="gmt-top-tab">Solicitudes</span>
            <span className="gmt-top-tab">Mis registros</span>
            <span className="gmt-top-tab">Informes</span>
            <span className="gmt-top-tab">Administracion</span>
          </div>
          <div className="gmt-top-actions">
            <button className="gmt-icon-btn" onClick={toggleSidebar} title={sidebarCollapsed ? "Mostrar menu" : "Ocultar menu"}>
              {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
            <button className="gmt-icon-btn"><Search className="w-4 h-4" /></button>
            <Link to="/settings" className="gmt-icon-btn" title="Mi configuracion"><Settings className="w-4 h-4" /></Link>
            <button className="gmt-icon-btn relative"><Bell className="w-4 h-4" /><span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 border-2 border-white" /></button>
            <button className="gmt-icon-btn lg:hidden"><Menu className="w-4 h-4" /></button>
            <div className="gmt-avatar">M</div>
          </div>
        </header>

        {currentRouteAllowed ? (
          <Outlet />
        ) : (
          <div className="gmt-panel mx-auto mt-8 max-w-xl">
            <div className="gmt-pill">Acceso restringido</div>
            <h1 className="gmt-title text-2xl mt-4">Modulo no autorizado</h1>
            <p className="gmt-subtitle">Tu departamento no tiene permisos para acceder a esta seccion.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {visibleLinks.map((l) => (
                <Link key={l.to} to={l.to} className="gmt-navlink">
                  <l.icon className="w-4 h-4" />
                  <span>{l.label}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}


import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
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
  Database,
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
  Users,
  WandSparkles,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({ component: AdminLayout });

const links = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, hint: "Resumen general" },
  { to: "/admin/attendance", label: "Marcaciones", icon: Clock, hint: "Registros y mapa" },
  { to: "/admin/shifts", label: "Planificador", icon: CalendarClock, hint: "Turnos dia/semana/mes" },
  { to: "/admin/access-maintenance", label: "Mantenimiento", icon: KeyRound, hint: "Usuarios y claves" },
  
  { to: "/admin/reports", label: "Informes", icon: BarChart3, hint: "Balance mensual" },
  { to: "/admin/checkin-messages", label: "Comunicados", icon: WandSparkles, hint: "Vista al fichar" },
  { to: "/admin/informativo", label: "Informativo", icon: Newspaper, hint: "Noticias internas" },
  { to: "/admin/alerts", label: "Alertas", icon: Bell, hint: "Incidencias" },
  { to: "/admin/security", label: "Seguridad", icon: Shield, hint: "Geo-IP y riesgos" },
  { to: "/admin/letters", label: "Cartas", icon: FileText, hint: "Amonestaciones" },
  { to: "/admin/settings", label: "Configuracion", icon: Settings, hint: "Reglas y oficina" },
] as const;

function AdminLayout() {
  useEffect(() => { applySavedUserTheme(); }, []);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
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
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        setIsAdmin(false);
        return;
      }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!data || /miguel|admin/i.test(u.user.email ?? ""));
    })();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }

  if (isAdmin === null) {
    return (
      <div className="gmt-shell">
        <div className="m-auto gmt-panel">
          <div className="gmt-pill">Cargando GrupMar Time...</div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="gmt-shell">
        <div className="m-auto gmt-panel max-w-lg">
          <div className="gmt-pill">Acceso restringido</div>
          <h1 className="gmt-title text-2xl mt-4">Panel administrador</h1>
          <p className="gmt-subtitle">Tu usuario no tiene rol administrador para entrar en esta seccion.</p>
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
            title={sidebarCollapsed ? "Mostrar menÃƒº" : "Ocultar menÃƒº"}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        <div className="gmt-side-section">
          <div className="gmt-side-title">Tiempo</div>
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              activeOptions={{ exact: l.to === "/admin" }}
              className="gmt-navlink"
              activeProps={{ className: "gmt-navlink gmt-navlink-active" }}
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
            <button className="gmt-icon-btn" onClick={toggleSidebar} title={sidebarCollapsed ? "Mostrar menÃƒº" : "Ocultar menÃƒº"}>
              {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
            <button className="gmt-icon-btn"><Search className="w-4 h-4" /></button>
            <Link to="/settings" className="gmt-icon-btn" title="Mi configuracion"><Settings className="w-4 h-4" /></Link>
            <button className="gmt-icon-btn relative"><Bell className="w-4 h-4" /><span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 border-2 border-white" /></button>
            <button className="gmt-icon-btn lg:hidden"><Menu className="w-4 h-4" /></button>
            <div className="gmt-avatar">M</div>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}














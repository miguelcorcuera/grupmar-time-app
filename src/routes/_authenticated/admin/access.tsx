import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Users } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/access")({
  component: AccessAdminRedirectPage,
});

function AccessAdminRedirectPage() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white">
          <Users className="h-7 w-7" />
        </div>

        <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">
          Módulo unificado
        </p>
        <h1 className="mt-2 text-3xl font-black text-slate-950">
          Accesos ahora vive en Mantenimiento
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          El camino canónico es Mantenimiento → Personal. Ahí se crean, editan,
          importan, exportan y administran trabajadores, roles, centros, áreas,
          documentos, cumpleaños y contraseña/Auth.
        </p>

        <Button className="mt-6" asChild>
          <Link to="/admin/access-maintenance">
            Ir a Mantenimiento · Personal
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

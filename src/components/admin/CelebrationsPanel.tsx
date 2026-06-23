import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Pencil, RefreshCw, RotateCcw, Save, Search, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type AnyRow = Record<string, any>;


function formatMMDD(value?: string | null) {
  if (!value) return "—";
  const [mm, dd] = String(value).split("-");
  return `${dd}/${mm}`;
}


const EMPTY_HOLIDAY = {
  id: "",
  name: "",
  mm_dd: "",
  scope: "Empresa",
  country: "España",
  region: "Baleares",
  active: true,
};

const EMPTY_SAINT = {
  id: "",
  names: "",
  mm_dd: "",
  active: true,
};

export function CelebrationsPage() {
  const { toast } = useToast();

  const [holidays, setHolidays] = useState<AnyRow[]>([]);
  const [saints, setSaints] = useState<AnyRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const [holidayEditor, setHolidayEditor] = useState<AnyRow>(EMPTY_HOLIDAY);
  const [saintEditor, setSaintEditor] = useState<AnyRow>(EMPTY_SAINT);

  async function loadAll() {
    setLoading(true);
    try {
      const [holidaysRes, saintsRes] = await Promise.all([
        (supabase as any)
          .from("company_holidays")
          .select("*")
          .order("mm_dd", { ascending: true }),
        (supabase as any)
          .from("saints_calendar")
          .select("*")
          .order("month", { ascending: true })
          .order("day", { ascending: true }),
      ]);

      if (holidaysRes.error) throw holidaysRes.error;
      if (saintsRes.error) throw saintsRes.error;

      setHolidays(holidaysRes.data || []);
      setSaints(saintsRes.data || []);
    } catch (error: any) {
      console.error(error);
      toast({ title: "Error cargando celebraciones", description: error.message || String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = query.trim().toLowerCase();


  const filteredHolidays = useMemo(() => {
    return holidays.filter((row) => row.active !== false).filter((row) => !q || JSON.stringify(row).toLowerCase().includes(q));
  }, [holidays, q]);

  const filteredSaints = useMemo(() => {
    return saints.filter((row) => row.active !== false).filter((row) => !q || JSON.stringify(row).toLowerCase().includes(q));
  }, [saints, q]);

  async function saveHoliday() {
    try {
      const payload = {
        name: holidayEditor.name,
        mm_dd: holidayEditor.mm_dd,
        scope: holidayEditor.scope || "autonomico",
        country: holidayEditor.country || "España",
        region: holidayEditor.municipality || null,
        active: holidayEditor.active !== false,
      };

      const { error } = await (supabase as any).rpc("admin_company_holiday_save", {
        p_id: holidayEditor.id || null,
        p_payload: payload,
      });

      if (error) throw error;

      toast({ title: "Festivo guardado" });
      setHolidayEditor(EMPTY_HOLIDAY);
      await loadAll();
    } catch (error: any) {
      toast({ title: "Error guardando festivo", description: error.message || String(error), variant: "destructive" });
    }
  }

  async function editHoliday(row: AnyRow) {
    setHolidayEditor({
      id: row.id,
      name: row.name || "",
      mm_dd: row.mm_dd || "",
      scope: row.scope || "Empresa",
      municipality: row.municipality || row.region || "",
      active: row.active !== false,
    });
  }

  async function inactivateHoliday(row: AnyRow) {
    try {
      const { error } = await (supabase as any).rpc("admin_company_holiday_save", {
        p_id: row.id,
        p_payload: { ...row, active: false },
      });
      if (error) throw error;
      await loadAll();
    } catch (error: any) {
      toast({ title: "Error inactivando festivo", description: error.message || String(error), variant: "destructive" });
    }
  }

  async function restoreHolidays() {
    try {
      const { error } = await (supabase as any).rpc("admin_restore_company_holidays_base");
      if (error) throw error;
      toast({ title: "Festivos base restaurados" });
      await loadAll();
    } catch (error: any) {
      toast({ title: "Error restaurando festivos", description: error.message || String(error), variant: "destructive" });
    }
  }

  async function saveSaint() {
    try {
      const payload = {
        names: saintEditor.names,
        mm_dd: saintEditor.mm_dd,
        active: saintEditor.active !== false,
      };

      const { error } = await (supabase as any).rpc("admin_saint_calendar_save", {
        p_id: saintEditor.id || null,
        p_payload: payload,
      });

      if (error) throw error;

      toast({ title: "Santoral guardado" });
      setSaintEditor(EMPTY_SAINT);
      await loadAll();
    } catch (error: any) {
      toast({ title: "Error guardando santoral", description: error.message || String(error), variant: "destructive" });
    }
  }

  function editSaint(row: AnyRow) {
    setSaintEditor({
      id: row.id,
      names: row.names || "",
      mm_dd: row.mm_dd || "",
      active: row.active !== false,
    });
  }

  async function inactivateSaint(row: AnyRow) {
    try {
      const { error } = await (supabase as any).rpc("admin_saint_calendar_save", {
        p_id: row.id,
        p_payload: { ...row, active: false },
      });
      if (error) throw error;
      await loadAll();
    } catch (error: any) {
      toast({ title: "Error inactivando santoral", description: error.message || String(error), variant: "destructive" });
    }
  }

  async function restoreSaints365() {
    try {
      const { error } = await (supabase as any).rpc("admin_restore_saints_calendar_365");
      if (error) throw error;
      toast({ title: "Santoral 365 restaurado" });
      await loadAll();
    } catch (error: any) {
      toast({ title: "Error restaurando santoral", description: error.message || String(error), variant: "destructive" });
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">Celebraciones canónicas</p>
              <h1 className="text-2xl font-black text-slate-950">Festivos y santoral</h1>
              <p className="text-sm text-slate-500">
                Festivos, feriados y santoral se guardan en Supabase. Los cumpleaños se gestionan únicamente desde Mantenimiento {">"} Personal.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={loadAll} disabled={loading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Actualizar
              </Button>

            </div>
          </div>
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar festivo, feriado o santoral..." />
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-2">

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-black text-slate-950">
                  <CalendarDays className="h-5 w-5" />
                  Festivos
                </h2>
                <p className="text-sm text-slate-500">Guardado en public.company_holidays.</p>
              </div>
              <Button variant="outline" size="sm" onClick={restoreHolidays}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Restaurar base
              </Button>
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="space-y-1">
                <Label>Nombre</Label>
                <Input value={holidayEditor.name || ""} onChange={(e) => setHolidayEditor((prev) => ({ ...prev, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Fecha MM-DD</Label>
                  <Input value={holidayEditor.mm_dd || ""} onChange={(e) => setHolidayEditor((prev) => ({ ...prev, mm_dd: e.target.value }))} placeholder="06-20" />
                </div>
                <div className="space-y-1">
                  <Label>Ámbito</Label>
                  <Input value={holidayEditor.scope || ""} onChange={(e) => setHolidayEditor((prev) => ({ ...prev, scope: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>País</Label>
                  <Input value={holidayEditor.country || ""} onChange={(e) => setHolidayEditor((prev) => ({ ...prev, country: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Región</Label>
                  <Input value={holidayEditor.municipality || ""} onChange={(e) => setHolidayEditor((prev) => ({ ...prev, municipality: e.target.value }))} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={holidayEditor.active !== false} onCheckedChange={(checked) => setHolidayEditor((prev) => ({ ...prev, active: checked }))} />
                <span className="text-sm text-slate-600">Activo</span>
              </div>
              <div className="flex gap-2">
                <Button onClick={saveHoliday}>
                  <Save className="mr-2 h-4 w-4" />
                  Guardar festivo
                </Button>
                <Button variant="outline" onClick={() => setHolidayEditor(EMPTY_HOLIDAY)}>Nuevo limpio</Button>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {filteredHolidays.map((row) => (
                <article key={row.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-3">
                  <div>
                    <div className="font-black text-slate-950">{row.name}</div>
                    <div className="text-xs text-slate-500">{formatMMDD(row.mm_dd)} · {row.scope || "Empresa"} {row.municipality ? `· ${row.municipality}` : row.region ? `· ${row.region}` : ""}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={() => editHoliday(row)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" onClick={() => inactivateHoliday(row)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-950">Santos / santoral</h2>
                <p className="text-sm text-slate-500">Guardado en public.saints_calendar.</p>
              </div>
              <Button variant="outline" size="sm" onClick={restoreSaints365}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Restaurar 365
              </Button>
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="space-y-1">
                <Label>Nombres / santoral</Label>
                <Textarea value={saintEditor.names || ""} onChange={(e) => setSaintEditor((prev) => ({ ...prev, names: e.target.value }))} placeholder="San Juan, Santa..." />
              </div>
              <div className="space-y-1">
                <Label>Fecha MM-DD</Label>
                <Input value={saintEditor.mm_dd || ""} onChange={(e) => setSaintEditor((prev) => ({ ...prev, mm_dd: e.target.value }))} placeholder="06-20" />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={saintEditor.active !== false} onCheckedChange={(checked) => setSaintEditor((prev) => ({ ...prev, active: checked }))} />
                <span className="text-sm text-slate-600">Activo</span>
              </div>
              <div className="flex gap-2">
                <Button onClick={saveSaint}>
                  <Save className="mr-2 h-4 w-4" />
                  Guardar santoral
                </Button>
                <Button variant="outline" onClick={() => setSaintEditor(EMPTY_SAINT)}>Nuevo limpio</Button>
              </div>
            </div>

            <div className="mt-4 max-h-[720px] space-y-2 overflow-y-auto pr-1">
              {filteredSaints.map((row) => (
                <article key={row.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-3">
                  <div>
                    <div className="font-black text-slate-950">{row.names}</div>
                    <div className="text-xs text-slate-500">{formatMMDD(row.mm_dd)}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={() => editSaint(row)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" onClick={() => inactivateSaint(row)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}


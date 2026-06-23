import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SortDir = "asc" | "desc";

export type TableSetting = {
  visible_columns: string[];
  column_order: string[];
  sort_key: string | null;
  sort_dir: SortDir;
};

function uniqueValid(values: string[] | null | undefined, allowed: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values || []) {
    if (!allowed.includes(value)) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }

  return result;
}

function arraysEqual(a: string[], b: string[]) {
  return a.length === b.length && a.every((x, index) => x === b[index]);
}

export function normalizeTableSetting(defaultColumns: string[], saved?: Partial<TableSetting> | null): TableSetting {
  const savedVisible = uniqueValid(saved?.visible_columns, defaultColumns);

  /*
    Regla:
    - Si existe configuración guardada y trae visible_columns, se respeta.
    - Si no existe, se usan defaults.
    - Jamás se pisan columnas guardadas con defaults sólo por cambiar de página.
  */
  const visible_columns = savedVisible.length ? savedVisible : defaultColumns;

  const savedOrder = uniqueValid(saved?.column_order, defaultColumns);
  const column_order = [
    ...savedOrder,
    ...defaultColumns.filter((key) => !savedOrder.includes(key)),
  ];

  const sort_key = saved?.sort_key && defaultColumns.includes(saved.sort_key) ? saved.sort_key : null;

  return {
    visible_columns,
    column_order,
    sort_key,
    sort_dir: saved?.sort_dir === "desc" ? "desc" : "asc",
  };
}

export function useUserTableSettings(tableKey: string, defaultColumns: string[]) {
  const [setting, setSetting] = useState<TableSetting>(() => normalizeTableSetting(defaultColumns));
  const [loading, setLoading] = useState(true);
  const lastRequest = useRef("");

  async function load() {
    const requestKey = `${tableKey}|${defaultColumns.join("|")}|${Date.now()}`;
    lastRequest.current = requestKey;
    setLoading(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const email = sessionData.session?.user?.email?.toLowerCase();

      if (!email) {
        if (lastRequest.current === requestKey) {
          setSetting(normalizeTableSetting(defaultColumns));
        }
        return;
      }

      let saved: any = null;

      const rpcResult = await (supabase as any).rpc("gmt_get_my_table_setting", {
        p_table_key: tableKey,
      });

      if (!rpcResult.error && rpcResult.data) {
        saved = rpcResult.data;
      } else {
        const directResult = await (supabase as any)
          .from("user_table_settings")
          .select("visible_columns,column_order,sort_key,sort_dir")
          .eq("email", email)
          .eq("table_key", tableKey)
          .maybeSingle();

        if (directResult.error) throw directResult.error;
        saved = directResult.data;
      }

      if (lastRequest.current === requestKey) {
        setSetting(normalizeTableSetting(defaultColumns, saved));
      }
    } catch (error) {
      console.error("No se pudo cargar user_table_settings", error);
      /*
        No pisamos alegremente con defaults si hubo error de BD.
        Dejamos el estado actual normalizado para no destruir la experiencia.
      */
      if (lastRequest.current === requestKey) {
        setSetting((prev) => normalizeTableSetting(defaultColumns, prev));
      }
    } finally {
      if (lastRequest.current === requestKey) setLoading(false);
    }
  }

  async function save(next: TableSetting) {
    const normalized = normalizeTableSetting(defaultColumns, next);

    if (!normalized.visible_columns.length) {
      throw new Error("No se puede guardar una tabla sin columnas visibles.");
    }

    // Optimista, pero si falla se recarga desde BD.
    const previous = setting;
    setSetting(normalized);

    try {
      const { data, error } = await (supabase as any).rpc("gmt_save_user_table_settings", {
        p_table_key: tableKey,
        p_visible_columns: normalized.visible_columns,
        p_column_order: normalized.column_order,
        p_sort_key: normalized.sort_key || "",
        p_sort_dir: normalized.sort_dir,
      });

      if (error) throw error;

      const verified = normalizeTableSetting(defaultColumns, data);

      const ok =
        arraysEqual(verified.visible_columns, normalized.visible_columns) &&
        arraysEqual(verified.column_order, normalized.column_order) &&
        verified.sort_key === normalized.sort_key &&
        verified.sort_dir === normalized.sort_dir;

      if (!ok) {
        console.error("Configuración guardada no coincide", { normalized, verified, data });
        throw new Error("La configuración fue guardada, pero la verificación no coincide.");
      }

      setSetting(verified);
      return verified;
    } catch (error) {
      console.error("No se pudo guardar user_table_settings", error);
      setSetting(previous);
      throw error;
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableKey, defaultColumns.join("|")]);

  const orderedVisibleColumns = useMemo(
    () => setting.column_order.filter((key) => setting.visible_columns.includes(key)),
    [setting]
  );

  const hiddenColumns = useMemo(
    () => defaultColumns.filter((key) => !setting.visible_columns.includes(key)),
    [defaultColumns, setting.visible_columns]
  );

  return {
    setting,
    setSetting,
    save,
    loading,
    reload: load,
    orderedVisibleColumns,
    hiddenColumns,
  };
}

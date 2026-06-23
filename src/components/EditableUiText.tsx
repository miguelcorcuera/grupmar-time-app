import { KeyboardEvent, ReactNode, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type EditableUiTextProps = {
  textKey: string;
  fallback: string;
  description?: string;
  className?: string;
  as?: "span" | "p" | "h1" | "h2" | "h3";
  children?: ReactNode;
};

const ADMIN_EMAILS = new Set([
  "ma.corcuera@grupomarport.com",
  "miguel.corcuera@gmail.com",
  "admin@empresa.com",
]);

export function EditableUiText({
  textKey,
  fallback,
  description,
  className,
  as = "span",
}: EditableUiTextProps) {
  const [value, setValue] = useState(fallback);
  const [draft, setDraft] = useState(fallback);
  const [editing, setEditing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      const email = userData.user?.email?.toLowerCase() || "";
      if (mounted) setIsAdmin(ADMIN_EMAILS.has(email));

      const { data } = await (supabase as any)
        .from("ui_text_overrides")
        .select("value")
        .eq("text_key", textKey)
        .maybeSingle();

      if (mounted && data?.value != null) {
        setValue(data.value);
        setDraft(data.value);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [textKey]);

  async function save() {
    const next = draft.trim() || fallback;
    setValue(next);
    setEditing(false);

    const { error } = await (supabase as any).rpc("gmt_save_ui_text_override", {
      p_text_key: textKey,
      p_value: next,
      p_description: description || null,
    });

    if (error) {
      console.error("No se pudo guardar texto UI", error);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") save();
    if (e.key === "Escape") {
      setDraft(value);
      setEditing(false);
    }
  }

  if (editing && isAdmin) {
    return (
      <input
        autoFocus
        className={className}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={onKeyDown}
      />
    );
  }

  const Comp: any = as;

  return (
    <Comp
      className={className}
      title={isAdmin ? "Doble click para editar" : undefined}
      onDoubleClick={isAdmin ? () => setEditing(true) : undefined}
    >
      {value}
    </Comp>
  );
}

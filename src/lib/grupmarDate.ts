export function formatDateDDMMYYYY(value?: string | Date | null) {
  if (!value) return "—";

  if (value instanceof Date) {
    const dd = String(value.getDate()).padStart(2, "0");
    const mm = String(value.getMonth() + 1).padStart(2, "0");
    const yyyy = value.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  const raw = String(value).trim();
  if (!raw) return "—";

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

  const es = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (es) return raw;

  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  return raw;
}

export function toInputDate(value?: string | Date | null) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  const es = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (es) return `${es[3]}-${es[2]}-${es[1]}`;

  return raw;
}

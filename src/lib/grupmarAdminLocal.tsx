export const ADMIN_BUILD_VERSION = "UI Bizneo v14.5 · informativo visual tipo periódico · 19/06/2026 00:35";

export function VersionBadge() {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium text-muted-foreground bg-muted/40">
      {ADMIN_BUILD_VERSION}
    </span>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { CelebrationsPage } from "@/components/admin/CelebrationsPanel";

export const Route = createFileRoute("/_authenticated/admin/celebrations")({
  component: CelebrationsPage,
});

import { createFileRoute } from "@tanstack/react-router";

import { EmployeeRequestsPanel } from "@/components/admin/EmployeeRequestsPanel";

export const Route = createFileRoute("/_authenticated/admin/employee-requests")({
  component: EmployeeRequestsPanel,
});

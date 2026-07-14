import { requireUser } from "@/lib/rbac";

export default async function NotificationsPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-2xl font-semibold">Notifications</h1>
      <p className="text-muted-foreground">
        Notifications arrive here once the task module is live (Phase 3).
      </p>
    </div>
  );
}

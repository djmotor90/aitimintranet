import Link from "next/link";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { UserSettingsMenu } from "@/components/shell/user-settings-menu";
import { signOut } from "@/lib/auth";
import { requireUser } from "@/lib/rbac";
import { navItemsFor } from "@/modules/registry";
import { getTaskNavTreeForUser } from "@/modules/tasks/queries";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const items = [{ label: "Home", href: "/", icon: "home" as const }, ...navItemsFor(user)];
  const taskNavTree = await getTaskNavTreeForUser(user);
  const isAdmin = user.platformRole === "admin";

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex h-svh overflow-hidden">
      <aside className="flex h-full w-56 shrink-0 flex-col overflow-y-auto border-r bg-sidebar p-4">
        <Link href="/" className="mb-6 px-3 text-lg font-semibold tracking-tight">
          AITIM <span className="text-muted-foreground">Intranet</span>
        </Link>
        <SidebarNav items={items} taskNavTree={taskNavTree} isAdmin={isAdmin} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-end border-b bg-background px-4 sm:px-6">
          <UserSettingsMenu
            user={{
              id: user.id,
              name: user.name ?? null,
              email: user.email ?? null,
              platformRole: user.platformRole,
            }}
            isAdmin={isAdmin}
            signOutAction={signOutAction}
          />
        </header>
        <main className="min-w-0 flex-1 overflow-x-auto overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}

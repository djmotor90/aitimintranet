import Link from "next/link";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { UserAvatar } from "@/components/shell/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth";
import { requireUser } from "@/lib/rbac";
import { adminNavItems, navItemsFor } from "@/modules/registry";
import { getTaskNavTreeForUser } from "@/modules/tasks/queries";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const items = [{ label: "Home", href: "/", icon: "home" as const }, ...navItemsFor(user)];
  const adminItems = user.platformRole === "admin" ? adminNavItems() : [];
  const taskNavTree = await getTaskNavTreeForUser(user);

  return (
    <div className="flex h-svh overflow-hidden">
      <aside className="flex h-full w-56 shrink-0 flex-col overflow-y-auto border-r bg-sidebar p-4">
        <Link href="/" className="mb-6 px-3 text-lg font-semibold tracking-tight">
          AITIM <span className="text-muted-foreground">Intranet</span>
        </Link>
        <SidebarNav items={items} taskNavTree={taskNavTree} />
        {adminItems.length > 0 && (
          <>
            <div className="mt-6 mb-2 px-3 text-xs font-semibold uppercase text-muted-foreground">
              Admin
            </div>
            <SidebarNav items={adminItems} />
          </>
        )}
        <div className="mt-auto pt-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-start gap-2 px-3">
                <UserAvatar userId={user.id} name={user.name ?? "?"} className="size-6" />
                <span className="truncate text-sm">{user.name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/login" });
                }}
              >
                <DropdownMenuItem asChild>
                  <button type="submit" className="w-full">
                    Sign out
                  </button>
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-x-auto overflow-y-auto p-6">{children}</main>
    </div>
  );
}

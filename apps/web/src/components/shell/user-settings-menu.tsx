"use client";

import { LogOut, Settings, Shield, UserRound, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  SettingsAdminGroupsPanel,
  SettingsAdminUsersPanel,
} from "@/components/shell/settings-admin-panels";
import { UserAvatar } from "@/components/shell/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type SectionId = "account" | "admin-users" | "admin-groups";

type MenuItem = {
  id: SectionId;
  label: string;
  icon: typeof Settings;
  group?: "admin";
};

export function UserSettingsMenu({
  user,
  isAdmin,
  signOutAction,
}: {
  user: { id: string; name: string | null; email: string | null; platformRole: string };
  isAdmin: boolean;
  signOutAction: () => Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [section, setSection] = useState<SectionId>("account");
  const displayName = user.name ?? "Account";

  const menuItems = useMemo<MenuItem[]>(() => {
    const items: MenuItem[] = [{ id: "account", label: "Account", icon: UserRound }];
    if (isAdmin) {
      items.push(
        { id: "admin-users", label: "Users", icon: Users, group: "admin" },
        { id: "admin-groups", label: "Groups & Roles", icon: Shield, group: "admin" },
      );
    }
    return items;
  }, [isAdmin]);

  const generalItems = menuItems.filter((i) => !i.group);
  const adminItems = menuItems.filter((i) => i.group === "admin");

  function openSettings() {
    setSection("account");
    setMenuOpen(false);
    setSettingsOpen(true);
  }

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 rounded-full p-0"
            aria-label="User menu"
            title={displayName}
          >
            <UserAvatar userId={user.id} name={displayName} className="size-8" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-0.5">
              <span className="truncate text-sm font-medium">{displayName}</span>
              {user.email && (
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {user.email}
                </span>
              )}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={openSettings} className="gap-2">
            <Settings className="size-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <form action={signOutAction}>
            <DropdownMenuItem asChild className="gap-2 text-destructive focus:text-destructive">
              <button type="submit" className="w-full">
                <LogOut className="size-4" />
                Sign out
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent
          showCloseButton={false}
          className={cn(
            "flex h-[min(920px,calc(100svh-2rem))] w-[min(1200px,calc(100vw-2rem))] max-w-none",
            "flex-col gap-0 overflow-hidden p-0 sm:max-w-none",
          )}
        >
          <DialogTitle className="sr-only">Settings</DialogTitle>
          <DialogDescription className="sr-only">
            Account settings and administration.
          </DialogDescription>

          <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Settings className="size-4" />
              Settings
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setSettingsOpen(false)}
              aria-label="Close settings"
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="flex min-h-0 flex-1">
            <aside className="flex w-56 shrink-0 flex-col border-r bg-muted/20">
              <nav className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
                <MenuGroup
                  label="General"
                  items={generalItems}
                  section={section}
                  onSelect={setSection}
                />
                {adminItems.length > 0 && (
                  <MenuGroup
                    label="Admin"
                    items={adminItems}
                    section={section}
                    onSelect={setSection}
                  />
                )}
              </nav>

              <div className="border-t p-3">
                <form action={signOutAction}>
                  <Button
                    type="submit"
                    variant="ghost"
                    className="w-full justify-start gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <LogOut className="size-4" />
                    Sign out
                  </Button>
                </form>
              </div>
            </aside>

            <section className="min-w-0 flex-1 overflow-y-auto p-6">
              {section === "account" && (
                <div className="mx-auto flex max-w-lg flex-col gap-6">
                  <div>
                    <h2 className="text-lg font-semibold">Account</h2>
                    <p className="text-sm text-muted-foreground">Your profile on the intranet.</p>
                  </div>
                  <div className="flex items-center gap-4 rounded-xl border bg-muted/20 p-4">
                    <UserAvatar userId={user.id} name={displayName} className="size-14" />
                    <div className="min-w-0">
                      <div className="truncate text-base font-medium">{displayName}</div>
                      {user.email && (
                        <div className="truncate text-sm text-muted-foreground">{user.email}</div>
                      )}
                      <div className="mt-1 text-xs capitalize text-muted-foreground">
                        Role: {user.platformRole}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {section === "admin-users" && isAdmin && <SettingsAdminUsersPanel />}
              {section === "admin-groups" && isAdmin && <SettingsAdminGroupsPanel />}
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MenuGroup({
  label,
  items,
  section,
  onSelect,
}: {
  label: string;
  items: MenuItem[];
  section: SectionId;
  onSelect: (id: SectionId) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {items.map((item) => {
        const Icon = item.icon;
        const active = section === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={cn(
              "flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

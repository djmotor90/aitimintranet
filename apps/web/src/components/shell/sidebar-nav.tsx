"use client";

import {
  Bell,
  Building2,
  ChevronDown,
  Home,
  type LucideIcon,
  Shield,
  SquareCheckBig,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavIcon, NavItem } from "@/modules/types";
import { cn } from "@/lib/utils";
import { NotificationBadge } from "./notification-badge";

const ICONS: Record<NavIcon, LucideIcon> = {
  users: Users,
  bell: Bell,
  shield: Shield,
  building: Building2,
  tasks: SquareCheckBig,
  home: Home,
};

export interface TaskNavTreeItem {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  lists: {
    id: string;
    name: string;
    slug: string;
  }[];
}

export function SidebarNav({
  items,
  taskNavTree = [],
}: {
  items: NavItem[];
  taskNavTree?: TaskNavTreeItem[];
}) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const showTaskTree = item.href === "/tasks" && active && taskNavTree.length > 0;
        return (
          <div key={item.href}>
            <Link
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.href === "/notifications" && <NotificationBadge />}
              {showTaskTree && <ChevronDown className="size-3.5" />}
            </Link>

            {showTaskTree && (
              <div className="mt-1 ml-5 flex flex-col gap-1 border-l border-border pl-2">
                {taskNavTree.map((space) => {
                  const spaceHref = `/tasks/${space.slug}`;
                  const spaceActive =
                    pathname === spaceHref || pathname.startsWith(`${spaceHref}/`);
                  return (
                    <div key={space.id} className="flex flex-col gap-1">
                      <Link
                        href={spaceHref}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                          spaceActive
                            ? "bg-muted font-medium text-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <span
                          className="size-2 shrink-0 rounded-full bg-muted-foreground"
                          style={space.color ? { backgroundColor: space.color } : undefined}
                        />
                        <span className="truncate">{space.name}</span>
                      </Link>

                      {space.lists.length > 0 && (
                        <div className="ml-3 flex flex-col gap-0.5 border-l border-border pl-2">
                          {space.lists.map((list) => {
                            const listHref = `${spaceHref}/${list.slug}`;
                            const listActive =
                              pathname === listHref || pathname.startsWith(`${listHref}/`);
                            return (
                              <Link
                                key={list.id}
                                href={listHref}
                                className={cn(
                                  "rounded-md px-2 py-1 text-xs transition-colors",
                                  listActive
                                    ? "bg-muted font-medium text-foreground"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                )}
                              >
                                <span className="block truncate">{list.name}</span>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

"use client";

import {
  Bell,
  Building2,
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

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
            {item.href === "/notifications" && <NotificationBadge />}
          </Link>
        );
      })}
    </nav>
  );
}

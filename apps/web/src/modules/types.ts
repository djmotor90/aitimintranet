export interface SessionUserLike {
  id: string;
  platformRole: "admin" | "member";
}

/** Icon names resolved client-side in sidebar-nav.tsx */
export type NavIcon = "users" | "bell" | "shield" | "building" | "tasks" | "home";

export interface NavItem {
  label: string;
  href: string;
  icon: NavIcon;
}

export interface ModuleManifest {
  slug: string;
  name: string;
  basePath: string;
  navItems: NavItem[];
  /** Whether this user can see/use the module. */
  access: (user: SessionUserLike) => boolean;
  /** Extra nav items shown under Admin for platform admins. */
  adminNavItems?: NavItem[];
}

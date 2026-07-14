import type { ModuleManifest } from "../types";

export const shellManifest: ModuleManifest = {
  slug: "shell",
  name: "Intranet",
  basePath: "/",
  navItems: [
    { label: "Directory", href: "/directory", icon: "users" },
    { label: "Notifications", href: "/notifications", icon: "bell" },
  ],
  access: () => true,
  adminNavItems: [
    { label: "Users", href: "/admin/users", icon: "users" },
    { label: "Groups & Roles", href: "/admin/groups", icon: "shield" },
  ],
};

import type { ModuleManifest } from "../types";

export const tasksManifest: ModuleManifest = {
  slug: "tasks",
  name: "Tasks",
  basePath: "/tasks",
  navItems: [{ label: "Tasks", href: "/tasks", icon: "tasks" }],
  access: () => true,
};

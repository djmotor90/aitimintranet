import { shellManifest } from "./shell/manifest";
import { tasksManifest } from "./tasks/manifest";
import type { ModuleManifest, SessionUserLike } from "./types";

export const moduleRegistry: ModuleManifest[] = [shellManifest, tasksManifest];

export function navItemsFor(user: SessionUserLike) {
  return moduleRegistry.filter((m) => m.access(user)).flatMap((m) => m.navItems);
}

export function adminNavItems() {
  return moduleRegistry.flatMap((m) => m.adminNavItems ?? []);
}

"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
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
import { forwardRef, useMemo, useState, useTransition } from "react";
import { moveFolder, moveList } from "@/modules/tasks/actions";
import { SpaceNavContextMenu, TasksRootContextMenu } from "@/modules/tasks/components/nav-context-menus";
import { FolderRow, ListRow } from "@/modules/tasks/components/sidebar-tree-nodes";
import type { FolderNavNode, ListNavNode } from "@/modules/tasks/queries";
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
  /** False when the user only has direct access to one or more lists within this space, not the space itself. */
  hasSpaceAccess: boolean;
  isOwner: boolean;
  folders: FolderNavNode[];
  lists: ListNavNode[];
}

interface SpaceDropRowProps extends React.HTMLAttributes<HTMLElement> {
  space: TaskNavTreeItem;
  spaceHref: string;
  active: boolean;
}

const SpaceDropRow = forwardRef<HTMLElement, SpaceDropRowProps>(function SpaceDropRow(
  { space, spaceHref, active, ...rest },
  forwardedRef,
) {
  const { setNodeRef, isOver } = useDroppable({ id: `drop:space:${space.id}` });
  const setRefs = (node: HTMLElement | null) => {
    setNodeRef(node);
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };
  const inner = (
    <span
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
        isOver && "bg-muted ring-2 ring-primary/30",
        active
          ? "bg-muted font-medium text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <span
        className="size-2 shrink-0 rounded-full bg-muted-foreground"
        style={space.color ? { backgroundColor: space.color } : undefined}
      />
      <span className="truncate">{space.name}</span>
    </span>
  );
  return space.hasSpaceAccess ? (
    <Link ref={setRefs} href={spaceHref} {...rest}>
      {inner}
    </Link>
  ) : (
    <div ref={setRefs} {...rest}>
      {inner}
    </div>
  );
});

/** Walks a space's folder trees once to build id -> {spaceId, parentFolderId} lookups for drag-and-drop. */
function buildFolderIndex(taskNavTree: TaskNavTreeItem[]) {
  const index = new Map<string, { spaceId: string; parentFolderId: string | null }>();
  function walk(node: FolderNavNode, spaceId: string, parentFolderId: string | null) {
    index.set(node.id, { spaceId, parentFolderId });
    for (const sub of node.subfolders) walk(sub, spaceId, node.id);
  }
  for (const space of taskNavTree) {
    for (const f of space.folders) walk(f, space.id, null);
  }
  return index;
}

/** Is `candidateId` equal to or a descendant of `folderId`? Used to block moving a folder into itself. */
function isSelfOrDescendant(
  index: Map<string, { spaceId: string; parentFolderId: string | null }>,
  folderId: string,
  candidateId: string,
): boolean {
  let current: string | null = candidateId;
  while (current) {
    if (current === folderId) return true;
    current = index.get(current)?.parentFolderId ?? null;
  }
  return false;
}

export function SidebarNav({
  items,
  taskNavTree = [],
  isAdmin = false,
}: {
  items: NavItem[];
  taskNavTree?: TaskNavTreeItem[];
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const folderIndex = useMemo(() => buildFolderIndex(taskNavTree), [taskNavTree]);

  function findLabel(id: string): string | null {
    const [, type, entityId] = id.split(":");
    for (const space of taskNavTree) {
      if (type === "list") {
        const found = space.lists.find((l) => l.id === entityId);
        if (found) return found.name;
      }
      function searchFolders(nodes: FolderNavNode[]): string | null {
        for (const f of nodes) {
          if (type === "folder" && f.id === entityId) return f.name;
          if (type === "list") {
            const found = f.lists.find((l) => l.id === entityId);
            if (found) return found.name;
          }
          const nested = searchFolders(f.subfolders);
          if (nested) return nested;
        }
        return null;
      }
      const found = searchFolders(space.folders);
      if (found) return found;
    }
    return null;
  }

  function onDragStart(event: DragStartEvent) {
    setActiveLabel(findLabel(String(event.active.id)));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveLabel(null);
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const [, activeType, activeEntityId] = activeId.split(":");
    const [, overType, overEntityId] = overId.split(":");

    const targetFolderId = overType === "folder" ? overEntityId : null;
    const targetSpaceId =
      overType === "space" ? overEntityId : targetFolderId ? folderIndex.get(targetFolderId)?.spaceId : undefined;
    if (!targetSpaceId) return;

    if (activeType === "folder") {
      if (targetFolderId && isSelfOrDescendant(folderIndex, activeEntityId, targetFolderId)) return;
      const current = folderIndex.get(activeEntityId);
      if (current && current.spaceId === targetSpaceId && current.parentFolderId === targetFolderId) return;
      startTransition(async () => {
        await moveFolder(activeEntityId, targetSpaceId, targetFolderId);
      });
    } else if (activeType === "list") {
      startTransition(async () => {
        await moveList(activeEntityId, targetSpaceId, targetFolderId);
      });
    }
  }

  return (
    <DndContext id="sidebar-tree-dnd" sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const showTaskTree = item.href === "/tasks" && active && taskNavTree.length > 0;
          const linkEl = (
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
          );
          return (
            <div key={item.href}>
              {item.href === "/tasks" ? (
                <TasksRootContextMenu isAdmin={isAdmin}>{linkEl}</TasksRootContextMenu>
              ) : (
                linkEl
              )}

              {showTaskTree && (
                <div className="mt-1 ml-5 flex flex-col gap-1 border-l border-border pl-2">
                  {taskNavTree.map((space) => {
                    const spaceHref = `/tasks/${space.slug}`;
                    const spaceActive = pathname === spaceHref || pathname.startsWith(`${spaceHref}/`);
                    return (
                      <div key={space.id} className="flex flex-col gap-1">
                        <SpaceNavContextMenu spaceId={space.id} isOwner={space.isOwner}>
                          <SpaceDropRow space={space} spaceHref={spaceHref} active={spaceActive} />
                        </SpaceNavContextMenu>

                        {(space.folders.length > 0 || space.lists.length > 0) && (
                          <div className="ml-3 flex flex-col gap-1 border-l border-border pl-2">
                            {space.folders.map((f) => (
                              <FolderRow
                                key={f.id}
                                node={f}
                                spaceId={space.id}
                                spaceSlug={space.slug}
                                canManage={space.isOwner}
                              />
                            ))}
                            {space.lists.map((list) => (
                              <ListRow
                                key={list.id}
                                list={list}
                                spaceSlug={space.slug}
                                canManage={space.isOwner}
                              />
                            ))}
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
      <DragOverlay>
        {activeLabel ? (
          <div className="rounded-md border bg-popover px-2 py-1 text-xs shadow-md">{activeLabel}</div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

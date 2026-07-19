"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ChevronDown, ChevronRight, Folder } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { FolderNavContextMenu, ListNavContextMenu } from "./nav-context-menus";
import type { FolderNavNode, ListNavNode } from "../queries";

function useCombinedRef(...refs: ((node: HTMLElement | null) => void)[]) {
  return (node: HTMLElement | null) => {
    for (const ref of refs) ref(node);
  };
}

/** True if this folder (or a nested folder) contains the list currently in the URL. */
export function folderContainsPath(
  node: FolderNavNode,
  spaceSlug: string,
  pathname: string,
): boolean {
  for (const list of node.lists) {
    const href = `/tasks/${spaceSlug}/${list.slug}`;
    if (pathname === href || pathname.startsWith(`${href}/`)) return true;
  }
  return node.subfolders.some((sub) => folderContainsPath(sub, spaceSlug, pathname));
}

export function ListRow({
  list,
  spaceSlug,
  canManage,
}: {
  list: ListNavNode;
  spaceSlug: string;
  canManage: boolean;
}) {
  const pathname = usePathname();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `drag:list:${list.id}`,
  });
  const listHref = `/tasks/${spaceSlug}/${list.slug}`;
  const listActive = pathname === listHref || pathname.startsWith(`${listHref}/`);

  return (
    <ListNavContextMenu spaceSlug={spaceSlug} listSlug={list.slug} canManage={canManage}>
      <Link
        ref={setNodeRef}
        href={listHref}
        {...attributes}
        {...listeners}
        className={cn(
          "block rounded-md px-2 py-1 text-xs transition-colors",
          isDragging && "opacity-40",
          listActive
            ? "bg-muted font-medium text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <span className="block truncate">{list.name}</span>
      </Link>
    </ListNavContextMenu>
  );
}

export function FolderRow({
  node,
  spaceId,
  spaceSlug,
  canManage,
  isExpanded,
  onToggle,
  isFolderExpanded,
  onToggleFolder,
}: {
  node: FolderNavNode;
  spaceId: string;
  spaceSlug: string;
  canManage: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  /** Resolve expand state for nested folders. */
  isFolderExpanded: (folderId: string) => boolean;
  onToggleFolder: (folderId: string) => void;
}) {
  const pathname = usePathname();
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `drag:folder:${node.id}`,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `drop:folder:${node.id}` });
  const setRefs = useCombinedRef(setDragRef, setDropRef);

  const hasChildren = node.subfolders.length > 0 || node.lists.length > 0;
  const containsActive = folderContainsPath(node, spaceSlug, pathname);
  const expanded = hasChildren && isExpanded;

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-0.5">
        {hasChildren ? (
          <button
            type="button"
            aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
            aria-expanded={expanded}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggle();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {expanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </button>
        ) : (
          <span className="size-5 shrink-0" aria-hidden />
        )}

        <FolderNavContextMenu
          folderId={node.id}
          spaceId={spaceId}
          isPrivate={node.isPrivate}
          canManage={canManage}
        >
          <div
            ref={setRefs}
            {...attributes}
            {...listeners}
            className={cn(
              "flex min-w-0 flex-1 cursor-grab items-center gap-2 rounded-md px-1.5 py-1.5 text-sm text-muted-foreground transition-colors active:cursor-grabbing",
              isDragging && "opacity-40",
              containsActive && "text-foreground",
              isOver ? "bg-muted ring-2 ring-primary/30" : "hover:bg-muted hover:text-foreground",
            )}
          >
            <Folder className="size-3.5 shrink-0" />
            <span className="truncate">{node.name}</span>
          </div>
        </FolderNavContextMenu>
      </div>

      {expanded && hasChildren && (
        <div className="ml-3 flex flex-col gap-0.5 border-l border-border pl-1.5">
          {node.subfolders.map((sub) => (
            <FolderRow
              key={sub.id}
              node={sub}
              spaceId={spaceId}
              spaceSlug={spaceSlug}
              canManage={canManage}
              isExpanded={isFolderExpanded(sub.id)}
              onToggle={() => onToggleFolder(sub.id)}
              isFolderExpanded={isFolderExpanded}
              onToggleFolder={onToggleFolder}
            />
          ))}
          {node.lists.map((list) => (
            <ListRow key={list.id} list={list} spaceSlug={spaceSlug} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  );
}

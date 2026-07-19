"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Folder } from "lucide-react";
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
}: {
  node: FolderNavNode;
  spaceId: string;
  spaceSlug: string;
  canManage: boolean;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `drag:folder:${node.id}`,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `drop:folder:${node.id}` });
  const setRefs = useCombinedRef(setDragRef, setDropRef);

  return (
    <div className="flex flex-col gap-1">
      <FolderNavContextMenu folderId={node.id} spaceId={spaceId} isPrivate={node.isPrivate} canManage={canManage}>
        <div
          ref={setRefs}
          {...attributes}
          {...listeners}
          className={cn(
            "flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors active:cursor-grabbing",
            isDragging && "opacity-40",
            isOver ? "bg-muted ring-2 ring-primary/30" : "hover:bg-muted hover:text-foreground",
          )}
        >
          <Folder className="size-3.5 shrink-0" />
          <span className="truncate">{node.name}</span>
        </div>
      </FolderNavContextMenu>

      {(node.subfolders.length > 0 || node.lists.length > 0) && (
        <div className="ml-3 flex flex-col gap-1 border-l border-border pl-2">
          {node.subfolders.map((sub) => (
            <FolderRow key={sub.id} node={sub} spaceId={spaceId} spaceSlug={spaceSlug} canManage={canManage} />
          ))}
          {node.lists.map((list) => (
            <ListRow key={list.id} list={list} spaceSlug={spaceSlug} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  );
}

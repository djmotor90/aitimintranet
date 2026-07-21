"use client";

import { Building2, Folder, List, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  purgeFolder,
  purgeList,
  purgeSpace,
  restoreFolder,
  restoreList,
  restoreSpace,
} from "../actions";
import type { TrashItem } from "../queries";

function kindIcon(kind: TrashItem["kind"]) {
  switch (kind) {
    case "space":
      return <Building2 className="size-4 shrink-0 text-muted-foreground" />;
    case "folder":
      return <Folder className="size-4 shrink-0 text-muted-foreground" />;
    case "list":
      return <List className="size-4 shrink-0 text-muted-foreground" />;
  }
}

function kindLabel(kind: TrashItem["kind"]) {
  switch (kind) {
    case "space":
      return "Space";
    case "folder":
      return "Folder";
    case "list":
      return "List";
  }
}

function formatWhen(d: string | Date) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d instanceof Date ? d : new Date(d));
  } catch {
    return String(d);
  }
}

type TrashItemClient = Omit<TrashItem, "deletedAt"> & { deletedAt: string | Date };

export function TrashPanel({ items: initial }: { items: TrashItemClient[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function removeLocal(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function onRestore(item: TrashItemClient) {
    setPendingId(item.id);
    startTransition(async () => {
      try {
        if (item.kind === "space") await restoreSpace(item.id);
        else if (item.kind === "folder") await restoreFolder(item.id);
        else await restoreList(item.id);
        removeLocal(item.id);
        toast.success(`Restored “${item.name}”`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to restore");
      } finally {
        setPendingId(null);
      }
    });
  }

  function onPurge(item: TrashItemClient) {
    if (
      !window.confirm(
        `Permanently delete “${item.name}”? This cannot be undone${
          item.kind === "space" || item.kind === "folder" ? " and removes all nested content" : ""
        }.`,
      )
    ) {
      return;
    }
    setPendingId(item.id);
    startTransition(async () => {
      try {
        if (item.kind === "space") await purgeSpace(item.id);
        else if (item.kind === "folder") await purgeFolder(item.id);
        else await purgeList(item.id);
        removeLocal(item.id);
        toast.success(`Permanently deleted “${item.name}”`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to permanently delete");
      } finally {
        setPendingId(null);
      }
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <Trash2 className="mx-auto mb-3 size-8 text-muted-foreground/60" />
        <p className="text-sm font-medium">Trash is empty</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Deleted spaces, folders, and lists will appear here so you can restore them.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y rounded-lg border">
      {items.map((item) => {
        const busy = pendingId === item.id;
        return (
          <li
            key={`${item.kind}-${item.id}`}
            className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap"
          >
            <div className="flex min-w-0 flex-1 items-start gap-3">
              {kindIcon(item.kind)}
              <div className="min-w-0">
                <div className="truncate font-medium">{item.name}</div>
                <div className="text-xs text-muted-foreground">
                  {kindLabel(item.kind)}
                  {item.kind !== "space" && item.parentName ? ` · in ${item.parentName}` : null}
                  {item.kind !== "space" ? ` · ${item.spaceName}` : null}
                  {" · "}
                  deleted {formatWhen(item.deletedAt)}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => onRestore(item)}
                className="gap-1.5"
              >
                <RotateCcw className="size-3.5" />
                Restore
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() => onPurge(item)}
                className="gap-1.5"
              >
                <Trash2 className="size-3.5" />
                Delete forever
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

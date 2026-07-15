"use client";

import { ChevronDown } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { UserAvatar } from "@/components/shell/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toggleAssignee } from "../actions";

interface UserOption {
  id: string;
  displayName: string;
  photoKey: string | null;
}

export function AssigneeSelect({
  taskId,
  users,
  selectedIds,
  disabled,
}: {
  taskId: string;
  users: UserOption[];
  selectedIds: string[];
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [optimisticSelectedIds, toggleOptimistic] = useOptimistic(
    selectedIds,
    (current, userId: string) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
  );
  const selected = users.filter((u) => optimisticSelectedIds.includes(u.id));
  const unselected = users.filter((u) => !optimisticSelectedIds.includes(u.id));
  const selectedLabel =
    selected.length === 0
      ? "Select assignees"
      : selected.length === 1
        ? selected[0].displayName
        : `${selected.length} selected`;

  function toggle(userId: string) {
    if (disabled) return;
    startTransition(async () => {
      toggleOptimistic(userId);
      const formData = new FormData();
      formData.set("taskId", taskId);
      formData.set("userId", userId);
      await toggleAssignee(formData);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || pending}
          className="h-9 w-full justify-between gap-2 px-3 font-normal"
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected.length > 0 && (
              <span className="flex shrink-0 -space-x-2">
                {selected.slice(0, 3).map((u) => (
                  <UserAvatar
                    key={u.id}
                    userId={u.id}
                    name={u.displayName}
                    hasPhoto={!!u.photoKey}
                    className="size-6 ring-2 ring-background"
                  />
                ))}
              </span>
            )}
            <span className={selected.length === 0 ? "truncate text-muted-foreground" : "truncate"}>
              {selectedLabel}
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-72">
        {selected.map((u) => (
          <DropdownMenuCheckboxItem
            key={u.id}
            checked
            onCheckedChange={() => toggle(u.id)}
            onSelect={(event) => event.preventDefault()}
            className="gap-2 py-1.5"
          >
            <UserAvatar userId={u.id} name={u.displayName} hasPhoto={!!u.photoKey} className="size-6" />
            <span className="truncate">{u.displayName}</span>
          </DropdownMenuCheckboxItem>
        ))}
        {selected.length > 0 && unselected.length > 0 && <DropdownMenuSeparator />}
        {unselected.map((u) => (
          <DropdownMenuCheckboxItem
            key={u.id}
            checked={false}
            onCheckedChange={() => toggle(u.id)}
            onSelect={(event) => event.preventDefault()}
            className="gap-2 py-1.5"
          >
            <UserAvatar userId={u.id} name={u.displayName} hasPhoto={!!u.photoKey} className="size-6" />
            <span className="truncate">{u.displayName}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

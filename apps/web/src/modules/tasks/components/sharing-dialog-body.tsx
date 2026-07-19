"use client";

import { Button } from "@/components/ui/button";
import type { SpaceMemberRow } from "../queries";

interface UserOption {
  id: string;
  displayName: string;
}

/**
 * Shared invite-and-member-list body used by both space-level sharing (a
 * Dialog, see space-settings-menu.tsx) and list-level sharing (a settings
 * tab, see list-sharing-panel.tsx). When `inheritedMembers` is provided,
 * members are split into an "inherited from space" section and a removable
 * "added directly" section — otherwise `members` renders flat.
 *
 * List scope only: a Public list has no direct members and everyone with
 * space access gets in automatically. Hitting "Remove" on an inherited row
 * locks the whole list to Private via `lockAction` — nobody carries over
 * automatically, so whoever should keep access needs adding back below.
 */
export function SharingDialogBody({
  idFieldName,
  idValue,
  members,
  addableUsers,
  addAction,
  removeAction,
  inheritedMembers,
  isPrivate,
  lockAction,
}: {
  idFieldName: "spaceId" | "listId" | "folderId";
  idValue: string;
  members: SpaceMemberRow[];
  addableUsers: UserOption[];
  addAction: (formData: FormData) => void | Promise<void>;
  removeAction: (formData: FormData) => void | Promise<void>;
  inheritedMembers?: SpaceMemberRow[];
  isPrivate?: boolean;
  lockAction?: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <form action={addAction} className="flex items-end gap-2">
        <input type="hidden" name={idFieldName} value={idValue} />
        <select
          name="userId"
          required
          defaultValue=""
          className="h-9 flex-1 rounded-md border bg-transparent px-2 text-sm"
        >
          <option value="" disabled>
            Add person…
          </option>
          {addableUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName}
            </option>
          ))}
        </select>
        <select
          name="role"
          defaultValue="member"
          className="h-9 rounded-md border bg-transparent px-2 text-sm"
        >
          <option value="owner">Owner</option>
          <option value="member">Member</option>
          <option value="guest">Guest</option>
        </select>
        <Button type="submit" size="sm" disabled={addableUsers.length === 0}>
          Invite
        </Button>
      </form>

      {inheritedMembers && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">
            {isPrivate ? "Space members (no access — list is private)" : "Space members (inherited)"}
          </p>
          {inheritedMembers.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 py-1">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{m.displayName}</p>
                {m.email && <p className="truncate text-xs text-muted-foreground">{m.email}</p>}
              </div>
              {isPrivate ? (
                <span className="text-xs text-muted-foreground">
                  {m.role === "owner" ? "owner (always has access)" : "no access"}
                </span>
              ) : m.role === "owner" ? (
                <span className="text-xs text-muted-foreground">owner (can&apos;t be removed)</span>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground capitalize">{m.role}</span>
                  {lockAction && (
                    <form action={lockAction}>
                      <input type="hidden" name={idFieldName} value={idValue} />
                      <input type="hidden" name="isPrivate" value="true" />
                      <Button variant="ghost" size="sm" type="submit">
                        Remove
                      </Button>
                    </form>
                  )}
                </div>
              )}
            </div>
          ))}
          {inheritedMembers.length === 0 && (
            <p className="text-sm text-muted-foreground">No one has space-level access.</p>
          )}
        </div>
      )}

      <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
        {inheritedMembers && (
          <p className="text-xs font-medium text-muted-foreground">Added directly to this list</p>
        )}
        {members.map((m) => {
          // Space scope only (no inheritedMembers): removing the sole owner is blocked
          // server-side anyway — surface that instead of letting the action throw.
          const isSoleSpaceOwner =
            !inheritedMembers &&
            m.role === "owner" &&
            members.filter((x) => x.role === "owner").length <= 1;
          return (
            <div key={m.id} className="flex items-center justify-between gap-2 py-1.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{m.displayName}</p>
                {m.email && <p className="truncate text-xs text-muted-foreground">{m.email}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground capitalize">{m.role}</span>
                {isSoleSpaceOwner ? (
                  <span className="text-xs text-muted-foreground">last owner</span>
                ) : (
                  <form action={removeAction}>
                    <input type="hidden" name="memberId" value={m.id} />
                    <Button variant="ghost" size="sm" type="submit">
                      Remove
                    </Button>
                  </form>
                )}
              </div>
            </div>
          );
        })}
        {members.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {inheritedMembers ? "No one added directly yet." : "No members yet."}
          </p>
        )}
      </div>
    </div>
  );
}

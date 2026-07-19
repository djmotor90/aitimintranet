"use client";

import { Building2, FolderPlus, ListPlus, Settings, Share2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addFolderMember,
  addSpaceMember,
  createFolder,
  createList,
  createSpace,
  getFolderSharingData,
  getSpaceSharingData,
  removeFolderMember,
  removeSpaceMember,
  setFolderPrivacy,
} from "../actions";
import type { SpaceMemberRow } from "../queries";
import { SharingDialogBody } from "./sharing-dialog-body";

/** Right-click menu on the "Tasks" root nav item — space creation is admin-only. */
export function TasksRootContextMenu({
  children,
  isAdmin,
}: {
  children: React.ReactNode;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!isAdmin) return <>{children}</>;

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => setOpen(true)} className="gap-2">
            <Building2 className="size-4" />
            Create new space
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Space</DialogTitle>
            <DialogDescription>Add a new top-level space for tasks.</DialogDescription>
          </DialogHeader>

          <form action={createSpace} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-space-name">Name</Label>
              <Input id="new-space-name" name="name" placeholder="e.g. Marketing" required autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-space-prefix">Task prefix (optional)</Label>
              <Input
                id="new-space-prefix"
                name="taskPrefix"
                placeholder="e.g. MKT"
                maxLength={10}
                className="uppercase"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-space-color">Color</Label>
              <Input id="new-space-color" name="color" type="color" defaultValue="#64748b" className="w-16 p-1" />
            </div>
            <Button type="submit" className="self-end">
              Create
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Right-click menu on a space row in the sidebar — owner-only actions. */
export function SpaceNavContextMenu({
  children,
  spaceId,
  isOwner,
}: {
  children: React.ReactNode;
  spaceId: string;
  isOwner: boolean;
}) {
  const [newListOpen, setNewListOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [sharingOpen, setSharingOpen] = useState(false);
  const [sharing, setSharing] = useState<{
    members: SpaceMemberRow[];
    addableUsers: { id: string; displayName: string }[];
  } | null>(null);
  const [loading, startLoading] = useTransition();

  if (!isOwner) return <>{children}</>;

  function openSharing() {
    setSharingOpen(true);
    startLoading(async () => {
      const data = await getSpaceSharingData(spaceId);
      setSharing(data);
    });
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => setNewListOpen(true)} className="gap-2">
            <ListPlus className="size-4" />
            New List
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => setNewFolderOpen(true)} className="gap-2">
            <FolderPlus className="size-4" />
            New Folder
          </ContextMenuItem>
          <ContextMenuItem onSelect={openSharing} className="gap-2">
            <Share2 className="size-4" />
            Sharing &amp; Permissions
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <Dialog open={newListOpen} onOpenChange={setNewListOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New List</DialogTitle>
            <DialogDescription>Add a list to this space.</DialogDescription>
          </DialogHeader>

          <form action={createList} className="flex flex-col gap-3">
            <input type="hidden" name="spaceId" value={spaceId} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`new-list-name-${spaceId}`}>Name</Label>
              <Input id={`new-list-name-${spaceId}`} name="name" placeholder="e.g. Inspections" required autoFocus />
            </div>
            <Button type="submit" className="self-end">
              Create
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
            <DialogDescription>Add a folder to this space.</DialogDescription>
          </DialogHeader>

          <form action={createFolder} className="flex flex-col gap-3">
            <input type="hidden" name="spaceId" value={spaceId} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`new-folder-name-${spaceId}`}>Name</Label>
              <Input
                id={`new-folder-name-${spaceId}`}
                name="name"
                placeholder="e.g. Client Projects"
                required
                autoFocus
              />
            </div>
            <Button type="submit" className="self-end">
              Create
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={sharingOpen} onOpenChange={setSharingOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sharing &amp; Permissions</DialogTitle>
            <DialogDescription>Who has access to this space and its lists.</DialogDescription>
          </DialogHeader>

          {loading || !sharing ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <SharingDialogBody
              idFieldName="spaceId"
              idValue={spaceId}
              members={sharing.members}
              addableUsers={sharing.addableUsers}
              addAction={async (formData) => {
                await addSpaceMember(formData);
                setSharing(await getSpaceSharingData(spaceId));
              }}
              removeAction={async (formData) => {
                await removeSpaceMember(formData);
                setSharing(await getSpaceSharingData(spaceId));
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Right-click menu on a list row in the sidebar — links into the full list settings page. */
export function ListNavContextMenu({
  children,
  spaceSlug,
  listSlug,
  canManage,
}: {
  children: React.ReactNode;
  spaceSlug: string;
  listSlug: string;
  canManage: boolean;
}) {
  if (!canManage) return <>{children}</>;

  const settingsHref = `/tasks/${spaceSlug}/${listSlug}/settings`;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem asChild className="gap-2">
          <Link href={settingsHref}>
            <Settings className="size-4" />
            List settings
          </Link>
        </ContextMenuItem>
        <ContextMenuItem asChild className="gap-2">
          <Link href={`${settingsHref}?tab=sharing`}>
            <Share2 className="size-4" />
            Sharing &amp; Permissions
          </Link>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Right-click menu on a folder row in the sidebar — owner-only actions. */
export function FolderNavContextMenu({
  children,
  folderId,
  spaceId,
  isPrivate,
  canManage,
}: {
  children: React.ReactNode;
  folderId: string;
  spaceId: string;
  isPrivate: boolean;
  canManage: boolean;
}) {
  const [newListOpen, setNewListOpen] = useState(false);
  const [newSubfolderOpen, setNewSubfolderOpen] = useState(false);
  const [sharingOpen, setSharingOpen] = useState(false);
  const [sharing, setSharing] = useState<{
    members: SpaceMemberRow[];
    addableUsers: { id: string; displayName: string }[];
  } | null>(null);
  const [loading, startLoading] = useTransition();
  const [privacyPending, startPrivacyTransition] = useTransition();

  if (!canManage) return <>{children}</>;

  function openSharing() {
    setSharingOpen(true);
    startLoading(async () => {
      const data = await getFolderSharingData(folderId);
      setSharing(data);
    });
  }

  function togglePrivacy(checked: boolean) {
    startPrivacyTransition(async () => {
      const formData = new FormData();
      formData.set("folderId", folderId);
      formData.set("isPrivate", String(checked));
      await setFolderPrivacy(formData);
    });
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => setNewListOpen(true)} className="gap-2">
            <ListPlus className="size-4" />
            New List
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => setNewSubfolderOpen(true)} className="gap-2">
            <FolderPlus className="size-4" />
            New Subfolder
          </ContextMenuItem>
          <ContextMenuItem onSelect={openSharing} className="gap-2">
            <Share2 className="size-4" />
            Sharing &amp; Permissions
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <Dialog open={newListOpen} onOpenChange={setNewListOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New List</DialogTitle>
            <DialogDescription>Add a list to this folder.</DialogDescription>
          </DialogHeader>

          <form action={createList} className="flex flex-col gap-3">
            <input type="hidden" name="spaceId" value={spaceId} />
            <input type="hidden" name="folderId" value={folderId} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`new-list-name-${folderId}`}>Name</Label>
              <Input
                id={`new-list-name-${folderId}`}
                name="name"
                placeholder="e.g. Inspections"
                required
                autoFocus
              />
            </div>
            <Button type="submit" className="self-end">
              Create
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={newSubfolderOpen} onOpenChange={setNewSubfolderOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Subfolder</DialogTitle>
            <DialogDescription>Add a subfolder inside this folder.</DialogDescription>
          </DialogHeader>

          <form action={createFolder} className="flex flex-col gap-3">
            <input type="hidden" name="spaceId" value={spaceId} />
            <input type="hidden" name="parentFolderId" value={folderId} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`new-subfolder-name-${folderId}`}>Name</Label>
              <Input
                id={`new-subfolder-name-${folderId}`}
                name="name"
                placeholder="e.g. 2026 Projects"
                required
                autoFocus
              />
            </div>
            <Button type="submit" className="self-end">
              Create
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={sharingOpen} onOpenChange={setSharingOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sharing &amp; Permissions</DialogTitle>
            <DialogDescription>Who has access to this folder and its contents.</DialogDescription>
          </DialogHeader>

          <div className="flex items-start gap-2 rounded-lg border p-3">
            <Checkbox
              id={`folder-private-${folderId}`}
              checked={isPrivate}
              disabled={privacyPending}
              onCheckedChange={(checked) => togglePrivacy(checked === true)}
              className="mt-0.5"
            />
            <Label htmlFor={`folder-private-${folderId}`} className="flex flex-col gap-0.5 font-normal">
              <span className="text-sm font-medium">{isPrivate ? "Private folder" : "Public folder"}</span>
              <span className="text-xs text-muted-foreground">
                {isPrivate
                  ? "Only people added below (and space owners) have access. Nothing carries over automatically."
                  : "Access carries over from the space (or parent folder). Switch to Private to control it directly instead."}
              </span>
            </Label>
          </div>

          {loading || !sharing ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <SharingDialogBody
              idFieldName="folderId"
              idValue={folderId}
              members={sharing.members}
              addableUsers={sharing.addableUsers}
              addAction={async (formData) => {
                await addFolderMember(formData);
                setSharing(await getFolderSharingData(folderId));
              }}
              removeAction={async (formData) => {
                await removeFolderMember(formData);
                setSharing(await getFolderSharingData(folderId));
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

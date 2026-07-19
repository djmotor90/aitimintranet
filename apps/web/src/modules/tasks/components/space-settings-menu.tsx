"use client";

import { ListPlus, Settings, Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addSpaceMember, createList, removeSpaceMember } from "../actions";
import type { SpaceMemberRow } from "../queries";
import { SharingDialogBody } from "./sharing-dialog-body";

interface UserOption {
  id: string;
  displayName: string;
}

export function SpaceSettingsMenu({
  spaceId,
  members,
  addableUsers,
}: {
  spaceId: string;
  members: SpaceMemberRow[];
  addableUsers: UserOption[];
}) {
  const [sharingOpen, setSharingOpen] = useState(false);
  const [newListOpen, setNewListOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Settings className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setNewListOpen(true)} className="gap-2">
            <ListPlus className="size-4" />
            New List
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setSharingOpen(true)} className="gap-2">
            <Share2 className="size-4" />
            Sharing &amp; Permissions
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={sharingOpen} onOpenChange={setSharingOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sharing &amp; Permissions</DialogTitle>
            <DialogDescription>Who has access to this space and its lists.</DialogDescription>
          </DialogHeader>

          <SharingDialogBody
            idFieldName="spaceId"
            idValue={spaceId}
            members={members}
            addableUsers={addableUsers}
            addAction={addSpaceMember}
            removeAction={removeSpaceMember}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={newListOpen} onOpenChange={setNewListOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New List</DialogTitle>
            <DialogDescription>Add a list to this space.</DialogDescription>
          </DialogHeader>

          <form action={createList} className="flex flex-col gap-3">
            <input type="hidden" name="spaceId" value={spaceId} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-list-name">Name</Label>
              <Input id="new-list-name" name="name" placeholder="e.g. Inspections" required autoFocus />
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

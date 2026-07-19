"use client";

import { useTransition } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { setListPrivacy } from "../actions";

export function ListPrivacyToggle({
  listId,
  isPrivate,
}: {
  listId: string;
  isPrivate: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function toggle(checked: boolean) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("listId", listId);
      formData.set("isPrivate", String(checked));
      await setListPrivacy(formData);
    });
  }

  return (
    <div className="flex items-start gap-2 rounded-lg border p-3">
      <Checkbox
        id="list-private"
        checked={isPrivate}
        disabled={pending}
        onCheckedChange={(checked) => toggle(checked === true)}
        className="mt-0.5"
      />
      <Label htmlFor="list-private" className="flex flex-col gap-0.5 font-normal">
        <span className="text-sm font-medium">{isPrivate ? "Private list" : "Public list"}</span>
        <span className="text-xs text-muted-foreground">
          {isPrivate
            ? "Only people added below (and space owners) have access. Nobody carries over automatically — add them back here."
            : "Every space member has access automatically. Switch to Private to control access person-by-person instead."}
        </span>
      </Label>
    </div>
  );
}

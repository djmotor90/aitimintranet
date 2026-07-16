"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createFieldDefinition } from "../actions";

const FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "date",
  "dropdown",
  "multi_select",
  "user",
  "checkbox",
  "url",
  "email",
  "phone",
];

const OPTIONS_TYPES = new Set(["dropdown", "multi_select"]);

export function FieldDefinitionForm({ listId }: { listId: string }) {
  const [type, setType] = useState("text");

  return (
    <form action={createFieldDefinition} className="flex flex-col gap-3 border-t pt-4">
      <input type="hidden" name="listId" value={listId} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="f-label">Label</Label>
          <Input id="f-label" name="label" required className="w-48" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="f-type">Type</Label>
          <select
            id="f-type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
          >
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <label className="flex h-9 items-center gap-2 text-sm">
          <Checkbox name="isRequired" /> Required
        </label>
        <Button type="submit">Add field</Button>
      </div>

      {OPTIONS_TYPES.has(type) && (
        <div className="flex flex-col gap-1">
          <Label htmlFor="f-options">Options — one per line</Label>
          <Textarea id="f-options" name="options" rows={3} className="max-w-sm" />
        </div>
      )}
    </form>
  );
}

"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface FieldDefLike {
  id: string;
  label: string;
  type: string;
  options: unknown;
  isRequired: boolean;
}

export interface UserOption {
  id: string;
  displayName: string;
}

/** ClickUp-style label picker: a compact trigger showing selected chips, with a
 * checklist popover — never renders the full option list inline. Selections are
 * mirrored into hidden inputs so the enclosing form still submits `name` as a
 * repeated field (same contract as a native `<select multiple>`). */
function MultiSelectField({
  name,
  options,
  defaultValue,
}: {
  name: string;
  options: { id: string; label: string; color?: string }[];
  defaultValue: string[];
}) {
  const [selected, setSelected] = useState<string[]>(defaultValue);

  function toggle(id: string) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((v) => v !== id) : [...cur, id]));
  }

  const selectedOptions = selected
    .map((id) => options.find((o) => o.id === id))
    .filter((o): o is (typeof options)[number] => !!o);

  return (
    <>
      {selected.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            id={name}
            type="button"
            className="flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border bg-transparent px-2 py-1.5 text-left text-sm hover:bg-muted"
          >
            {selectedOptions.length > 0 ? (
              selectedOptions.map((o) => (
                <span
                  key={o.id}
                  className="rounded px-1.5 py-0.5 text-xs font-medium"
                  style={
                    o.color
                      ? { backgroundColor: `${o.color}26`, color: o.color }
                      : { backgroundColor: "var(--muted)" }
                  }
                >
                  {o.label}
                </span>
              ))
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-72">
          {options.map((o) => (
            <DropdownMenuCheckboxItem
              key={o.id}
              checked={selected.includes(o.id)}
              onCheckedChange={() => toggle(o.id)}
              onSelect={(e) => e.preventDefault()}
            >
              {o.color && (
                <span
                  className="mr-1.5 size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: o.color }}
                />
              )}
              {o.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/** Uncontrolled inputs named cf_<definitionId>, parsed server-side. */
export function CustomFieldInput({
  def,
  users,
  defaultValue,
}: {
  def: FieldDefLike;
  users: UserOption[];
  defaultValue?: unknown;
}) {
  const name = `cf_${def.id}`;
  const options = (def.options ?? []) as { id: string; label: string }[];
  const dv = defaultValue as string | number | boolean | string[] | undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>
        {def.label}
        {def.isRequired && <span className="text-destructive"> *</span>}
      </Label>
      {def.type === "textarea" ? (
        <Textarea id={name} name={name} required={def.isRequired} defaultValue={(dv as string) ?? ""} />
      ) : def.type === "checkbox" ? (
        <Checkbox id={name} name={name} defaultChecked={dv === true} />
      ) : def.type === "dropdown" ? (
        <select
          id={name}
          name={name}
          required={def.isRequired}
          defaultValue={(dv as string) ?? ""}
          className="h-9 rounded-md border bg-transparent px-3 text-sm"
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      ) : def.type === "multi_select" ? (
        <MultiSelectField name={name} options={options} defaultValue={(dv as string[]) ?? []} />
      ) : def.type === "user" ? (
        <select
          id={name}
          name={name}
          required={def.isRequired}
          defaultValue={(dv as string) ?? ""}
          className="h-9 rounded-md border bg-transparent px-3 text-sm"
        >
          <option value="">—</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={name}
          name={name}
          required={def.isRequired}
          defaultValue={(dv as string | number) ?? ""}
          type={
            def.type === "number"
              ? "number"
              : def.type === "date"
                ? "date"
                : def.type === "email"
                  ? "email"
                  : def.type === "url"
                    ? "url"
                    : "text"
          }
          step={def.type === "number" ? "any" : undefined}
        />
      )}
    </div>
  );
}

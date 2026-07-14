import { Checkbox } from "@/components/ui/checkbox";
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
        <select
          id={name}
          name={name}
          multiple
          defaultValue={(dv as string[]) ?? []}
          className="min-h-20 rounded-md border bg-transparent px-3 py-2 text-sm"
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
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

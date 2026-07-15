/**
 * Task detail layout configuration stored as JSONB on the lists table.
 * Groups contain ordered field IDs. Fields not in any group are hidden.
 *
 * Core field IDs: "status" | "priority" | "due_date" | "assignees" | "description"
 * Custom field IDs: `cf_${definition.id}`
 */

export interface LayoutField {
  id: string;
}

export interface LayoutGroup {
  id: string;        // grp-{uuid}
  label: string;
  columns: 1 | 2 | 3;
  fields: LayoutField[];
}

export interface TaskLayout {
  groups: LayoutGroup[];
}

export const CORE_FIELDS: { id: string; label: string }[] = [
  { id: "status",      label: "Status" },
  { id: "priority",    label: "Priority" },
  { id: "due_date",    label: "Due date" },
  { id: "assignees",   label: "Assignees" },
  { id: "description", label: "Description" },
];

/** Build the default layout used when none has been configured yet. */
export function defaultLayout(fieldDefs: { id: string }[]): TaskLayout {
  return {
    groups: [
      {
        id: "grp-default",
        label: "Details",
        columns: 2,
        fields: [
          ...CORE_FIELDS.map((f) => ({ id: f.id })),
          ...fieldDefs.map((d) => ({ id: `cf_${d.id}` })),
        ],
      },
    ],
  };
}

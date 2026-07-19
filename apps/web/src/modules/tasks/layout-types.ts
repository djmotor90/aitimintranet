/**
 * Task detail layout configuration stored as JSONB on the lists table.
 * Groups contain ordered field IDs. Fields not in any group are hidden.
 *
 * Core field IDs: "status" | "priority" | "due_date" | "start_date" | "assignees" | "tags" | "description"
 *   Read-only auto-managed: "created_at" | "closed_at"
 * Custom field IDs: `cf_${definition.id}`
 */

export interface LayoutField {
  id: string;
}

export interface LayoutGroup {
  id: string;        // grp-{uuid}
  label: string;
  columns: 1 | 2 | 3 | 4 | 5;
  /** Whether the group renders with a visible border in the task view. */
  showBorder: boolean;
  fields: LayoutField[];
}

export interface TaskLayout {
  groups: LayoutGroup[];
}

export interface CoreField {
  id: string;
  label: string;
  /** Auto-managed by the system — rendered as read-only display, never submitted in forms. */
  readonly?: boolean;
}

/** All available core fields. readonly fields are hidden by default (not in defaultLayout). */
export const CORE_FIELDS: CoreField[] = [
  { id: "status",      label: "Status" },
  { id: "priority",    label: "Priority" },
  { id: "due_date",    label: "Due date" },
  { id: "start_date",  label: "Start date" },
  { id: "assignees",   label: "Assignees" },
  { id: "tags",        label: "Tags" },
  { id: "description", label: "Description" },
  { id: "created_at",  label: "Created date", readonly: true },
  { id: "closed_at",   label: "Closed date",  readonly: true },
];

/** IDs of core fields shown in the default layout (excludes readonly/auto-managed fields).
 *  Tags are rendered under the title (ClickUp-style) and can also be placed via the layout builder. */
const DEFAULT_FIELD_IDS = ["status", "priority", "due_date", "start_date", "assignees", "description"];

/** Build the default layout used when none has been configured yet. */
export function defaultLayout(fieldDefs: { id: string }[]): TaskLayout {
  return {
    groups: [
      {
        id: "grp-default",
        label: "Details",
        columns: 2,
        showBorder: true,
        fields: [
          ...DEFAULT_FIELD_IDS.map((id) => ({ id })),
          ...fieldDefs.map((d) => ({ id: `cf_${d.id}` })),
        ],
      },
    ],
  };
}

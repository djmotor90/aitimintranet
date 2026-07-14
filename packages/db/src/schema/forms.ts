import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { lists, tasks } from "./tasks";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const publicForms = pgTable("public_forms", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Unguessable slug, e.g. "safety-request-x7k2m9" */
  slug: text("slug").notNull().unique(),
  listId: uuid("list_id")
    .notNull()
    .references(() => lists.id),
  title: text("title").notNull(),
  introMd: text("intro_md"),
  successMessage: text("success_message"),
  isActive: boolean("is_active").notNull().default(true),
  /** Space role to notify on submission: "owner" | "member" */
  notifySpaceRole: text("notify_space_role").notNull().default("owner"),
  /**
   * Ordered field array:
   * [{ id, label, type, required, help,
   *    mapTo: { kind: "core", target: "title"|"description"|"priority"|"due_date"|"submitter_email"|"submitter_name" }
   *          | { kind: "custom_field", definitionId } }]
   */
  fields: jsonb("fields").notNull().default("[]"),
  ...timestamps,
});

export const formSubmissions = pgTable(
  "form_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formId: uuid("form_id")
      .notNull()
      .references(() => publicForms.id),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    rawPayload: jsonb("raw_payload").notNull(),
    submitterEmail: text("submitter_email"),
    submitterName: text("submitter_name"),
    ipHash: text("ip_hash"),
    turnstileOk: boolean("turnstile_ok"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("form_submissions_form_idx").on(t.formId, t.createdAt)],
);

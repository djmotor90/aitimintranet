import { relations, sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { modules, users } from "./platform";

export const spaceRole = pgEnum("space_role", ["owner", "member", "guest"]);
export const principalType = pgEnum("principal_type", ["user", "group"]);
export const statusCategory = pgEnum("status_category", ["open", "active", "done", "cancelled"]);
export const taskPriority = pgEnum("task_priority", ["urgent", "high", "normal", "low"]);
export const taskSource = pgEnum("task_source", ["manual", "public_form"]);
export const customFieldType = pgEnum("custom_field_type", [
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
]);
export const notificationType = pgEnum("notification_type", [
  "assigned",
  "mentioned",
  "comment",
  "status_changed",
  "due_soon",
  "form_submission",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const spaces = pgTable(
  "spaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => modules.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    /** Prefix for task numbers, e.g. "SAF" -> SAF-142 */
    taskPrefix: text("task_prefix").notNull(),
    icon: text("icon"),
    color: text("color"),
    isArchived: boolean("is_archived").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("spaces_slug_idx").on(t.slug)],
);

export const spaceTaskCounters = pgTable("space_task_counters", {
  spaceId: uuid("space_id")
    .primaryKey()
    .references(() => spaces.id, { onDelete: "cascade" }),
  nextNumber: integer("next_number").notNull().default(1),
});

export const spaceMembers = pgTable(
  "space_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    principalType: principalType("principal_type").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    groupId: uuid("group_id"),
    role: spaceRole("role").notNull().default("member"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("space_members_user_idx")
      .on(t.spaceId, t.userId)
      .where(sql`${t.userId} is not null`),
    uniqueIndex("space_members_group_idx")
      .on(t.spaceId, t.groupId)
      .where(sql`${t.groupId} is not null`),
  ],
);

export const folders = pgTable(
  "folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    /** Null for a top-level folder directly under the space. */
    parentFolderId: uuid("parent_folder_id"),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    position: text("position").notNull().default("a0"),
    isArchived: boolean("is_archived").notNull().default(false),
    /** When true, space (and parent-folder) membership does not grant access — only direct folderMembers rows do. */
    isPrivate: boolean("is_private").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("folders_space_slug_idx").on(t.spaceId, t.slug),
    index("folders_parent_idx").on(t.parentFolderId),
  ],
);

export const folderMembers = pgTable(
  "folder_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    folderId: uuid("folder_id")
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    principalType: principalType("principal_type").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    groupId: uuid("group_id"),
    role: spaceRole("role").notNull().default("member"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("folder_members_user_idx")
      .on(t.folderId, t.userId)
      .where(sql`${t.userId} is not null`),
    uniqueIndex("folder_members_group_idx")
      .on(t.folderId, t.groupId)
      .where(sql`${t.groupId} is not null`),
  ],
);

export const lists = pgTable(
  "lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    /** Null when the list sits directly under the space, not inside a folder. */
    folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    position: text("position").notNull().default("a0"),
    defaultStatusId: uuid("default_status_id"),
    isArchived: boolean("is_archived").notNull().default(false),
    taskLayout: jsonb("task_layout"),
    tableColumnOrder: jsonb("table_column_order"),
    /** Persisted default view: "table" | "board" */
    defaultView: text("default_view"),
    /** Persisted default groupBy, e.g. "status" | "cf_{id}" | null */
    defaultGroupBy: text("default_group_by"),
    /** When true, space (and parent-folder) membership does not grant access — only direct listMembers rows do. */
    isPrivate: boolean("is_private").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("lists_space_slug_idx").on(t.spaceId, t.slug)],
);

export const listMembers = pgTable(
  "list_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    principalType: principalType("principal_type").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    groupId: uuid("group_id"),
    role: spaceRole("role").notNull().default("member"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("list_members_user_idx")
      .on(t.listId, t.userId)
      .where(sql`${t.userId} is not null`),
    uniqueIndex("list_members_group_idx")
      .on(t.listId, t.groupId)
      .where(sql`${t.groupId} is not null`),
  ],
);

export const statuses = pgTable(
  "statuses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#94a3b8"),
    category: statusCategory("category").notNull().default("open"),
    position: text("position").notNull().default("a0"),
    ...timestamps,
  },
  (t) => [index("statuses_list_idx").on(t.listId)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id")
      .notNull()
      .references(() => lists.id),
    /** Human-readable per-space number, e.g. "SAF-142" */
    number: text("number").notNull(),
    title: text("title").notNull(),
    /** Tiptap document JSON */
    description: jsonb("description"),
    statusId: uuid("status_id")
      .notNull()
      .references(() => statuses.id),
    priority: taskPriority("priority"),
    dueDate: date("due_date"),
    startDate: date("start_date"),
    position: text("position").notNull().default("a0"),
    /** { [customFieldDefinitionId]: value } */
    customFields: jsonb("custom_fields").notNull().default(sql`'{}'::jsonb`),
    createdBy: uuid("created_by").references(() => users.id),
    source: taskSource("source").notNull().default("manual"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    isArchived: boolean("is_archived").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("tasks_number_idx").on(t.number),
    index("tasks_list_status_idx").on(t.listId, t.statusId),
    index("tasks_due_date_idx").on(t.dueDate),
    index("tasks_custom_fields_gin_idx").using("gin", t.customFields),
    /** Supports the paginated list-view ordering. */
    index("tasks_list_position_created_idx").on(t.listId, t.position, t.createdAt),
  ],
);

export const taskAssignees = pgTable(
  "task_assignees",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assignedBy: uuid("assigned_by").references(() => users.id),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId] }), index("task_assignees_user_idx").on(t.userId)],
);

export const customFieldDefinitions = pgTable(
  "custom_field_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: customFieldType("type").notNull(),
    /** dropdown/multi_select: [{ id, label, color }] */
    options: jsonb("options"),
    isRequired: boolean("is_required").notNull().default(false),
    position: text("position").notNull().default("a0"),
    isArchived: boolean("is_archived").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("custom_field_defs_list_key_idx").on(t.listId, t.key)],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    /** Tiptap document JSON; mentions stored as nodes with userId attrs */
    body: jsonb("body").notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("comments_task_idx").on(t.taskId)],
);

export const commentMentions = pgTable(
  "comment_mentions",
  {
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.userId] }), index("comment_mentions_user_idx").on(t.userId)],
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id").references(() => comments.id, { onDelete: "set null" }),
    uploaderId: uuid("uploader_id").references(() => users.id),
    objectKey: text("object_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    checksumSha256: text("checksum_sha256"),
    ...timestamps,
  },
  (t) => [index("attachments_task_idx").on(t.taskId)],
);

export const activityLog = pgTable(
  "activity_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id),
    /** Label for non-user actors, e.g. public form submitter */
    actorLabel: text("actor_label"),
    verb: text("verb").notNull(),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_log_task_idx").on(t.taskId, sql`${t.id} desc`)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationType("type").notNull(),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id),
    payload: jsonb("payload"),
    readAt: timestamp("read_at", { withTimezone: true }),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_recipient_idx").on(t.recipientId, t.readAt)],
);

export const emailDigest = pgEnum("email_digest", ["instant", "hourly", "off"]);

export const notificationPreferences = pgTable("notification_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** { [notificationType]: { inApp: boolean, email: boolean } } */
  preferences: jsonb("preferences").notNull().default(sql`'{}'::jsonb`),
  emailDigest: emailDigest("email_digest").notNull().default("instant"),
  ...timestamps,
});

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  list: one(lists, { fields: [tasks.listId], references: [lists.id] }),
  status: one(statuses, { fields: [tasks.statusId], references: [statuses.id] }),
  creator: one(users, { fields: [tasks.createdBy], references: [users.id] }),
  assignees: many(taskAssignees),
  comments: many(comments),
  attachments: many(attachments),
}));

export const taskAssigneesRelations = relations(taskAssignees, ({ one }) => ({
  task: one(tasks, { fields: [taskAssignees.taskId], references: [tasks.id] }),
  user: one(users, { fields: [taskAssignees.userId], references: [users.id] }),
}));

export const listsRelations = relations(lists, ({ one, many }) => ({
  space: one(spaces, { fields: [lists.spaceId], references: [spaces.id] }),
  folder: one(folders, { fields: [lists.folderId], references: [folders.id] }),
  statuses: many(statuses),
  tasks: many(tasks),
  customFieldDefinitions: many(customFieldDefinitions),
  members: many(listMembers),
}));

export const listMembersRelations = relations(listMembers, ({ one }) => ({
  list: one(lists, { fields: [listMembers.listId], references: [lists.id] }),
  user: one(users, { fields: [listMembers.userId], references: [users.id] }),
}));

export const foldersRelations = relations(folders, ({ one, many }) => ({
  space: one(spaces, { fields: [folders.spaceId], references: [spaces.id] }),
  parentFolder: one(folders, {
    fields: [folders.parentFolderId],
    references: [folders.id],
    relationName: "folder_subfolders",
  }),
  subfolders: many(folders, { relationName: "folder_subfolders" }),
  lists: many(lists),
  members: many(folderMembers),
}));

export const folderMembersRelations = relations(folderMembers, ({ one }) => ({
  folder: one(folders, { fields: [folderMembers.folderId], references: [folders.id] }),
  user: one(users, { fields: [folderMembers.userId], references: [users.id] }),
}));

export const spacesRelations = relations(spaces, ({ many }) => ({
  lists: many(lists),
  folders: many(folders),
  members: many(spaceMembers),
}));

export const spaceMembersRelations = relations(spaceMembers, ({ one }) => ({
  space: one(spaces, { fields: [spaceMembers.spaceId], references: [spaces.id] }),
  user: one(users, { fields: [spaceMembers.userId], references: [users.id] }),
}));

export const statusesRelations = relations(statuses, ({ one }) => ({
  list: one(lists, { fields: [statuses.listId], references: [lists.id] }),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  task: one(tasks, { fields: [comments.taskId], references: [tasks.id] }),
  author: one(users, { fields: [comments.authorId], references: [users.id] }),
  mentions: many(commentMentions),
}));

export const commentMentionsRelations = relations(commentMentions, ({ one }) => ({
  comment: one(comments, { fields: [commentMentions.commentId], references: [comments.id] }),
  user: one(users, { fields: [commentMentions.userId], references: [users.id] }),
}));

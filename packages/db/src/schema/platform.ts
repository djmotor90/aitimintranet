import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const platformRole = pgEnum("platform_role", ["admin", "member"]);
export const mappingTargetType = pgEnum("mapping_target_type", [
  "platform_role",
  "space_role",
  "module_access",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entraObjectId: text("entra_object_id").unique(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    jobTitle: text("job_title"),
    department: text("department"),
    managerId: uuid("manager_id"),
    photoKey: text("photo_key"),
    platformRole: platformRole("platform_role").notNull().default("member"),
    // Break-glass admin: never overwritten by the Entra sync job.
    isProtectedAdmin: boolean("is_protected_admin").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`),
    index("users_manager_idx").on(t.managerId),
  ],
);

export const usersRelations = relations(users, ({ one, many }) => ({
  manager: one(users, {
    fields: [users.managerId],
    references: [users.id],
    relationName: "manager",
  }),
  groupMemberships: many(userGroupMemberships),
}));

export const entraGroups = pgTable("entra_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  entraGroupId: text("entra_group_id").notNull().unique(),
  displayName: text("display_name").notNull(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  ...timestamps,
});

export const userGroupMemberships = pgTable(
  "user_group_memberships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => entraGroups.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.groupId] })],
);

export const userGroupMembershipsRelations = relations(userGroupMemberships, ({ one }) => ({
  user: one(users, { fields: [userGroupMemberships.userId], references: [users.id] }),
  group: one(entraGroups, { fields: [userGroupMemberships.groupId], references: [entraGroups.id] }),
}));

export const groupRoleMappings = pgTable(
  "group_role_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => entraGroups.id, { onDelete: "cascade" }),
    targetType: mappingTargetType("target_type").notNull(),
    /** space id or module id depending on targetType; null for platform_role */
    targetId: uuid("target_id"),
    role: text("role").notNull(),
    ...timestamps,
  },
  (t) => [index("group_role_mappings_group_idx").on(t.groupId)],
);

export const modules = pgTable("modules", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  ...timestamps,
});

/** Persisted Graph delta links & job bookkeeping */
export const syncState = pgTable("sync_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

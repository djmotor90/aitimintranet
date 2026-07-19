import {
  activityLog,
  customFieldDefinitions,
  db,
  folderMembers,
  folders,
  listMembers,
  lists,
  listViews,
  spaceMembers,
  spaces,
  statuses,
  tags,
  taskAssignees,
  tasks,
  taskTags,
  userGroupMemberships,
  users,
} from "@aitim/db";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { cache } from "react";
import { getFolderRole, getListRole, getSpaceRole } from "@/lib/rbac";
import type { SessionUserLike } from "../types";

export const getSpaceBySlug = cache(async (slug: string) => {
  const [space] = await db
    .select()
    .from(spaces)
    .where(and(eq(spaces.slug, slug), eq(spaces.isArchived, false)));
  return space ?? null;
});

export const getListsForSpace = cache(async (spaceId: string) => {
  return db
    .select()
    .from(lists)
    .where(and(eq(lists.spaceId, spaceId), eq(lists.isArchived, false)))
    .orderBy(asc(lists.position), asc(lists.createdAt));
});

export const getFoldersForSpace = cache(async (spaceId: string) => {
  return db
    .select()
    .from(folders)
    .where(and(eq(folders.spaceId, spaceId), eq(folders.isArchived, false)))
    .orderBy(asc(folders.position), asc(folders.createdAt));
});

export interface ListNavNode {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface FolderNavNode {
  id: string;
  name: string;
  slug: string;
  isPrivate: boolean;
  subfolders: FolderNavNode[];
  lists: ListNavNode[];
}

/**
 * Builds the folder/list tree for a single space, filtered to what `userId` can see.
 * Owners bypass everything and get the full tree. Otherwise a folder or list is
 * included if the user has any role on it (getFolderRole/getListRole), and its
 * ancestor folders are pulled in as pass-through containers so the path to a
 * directly-granted deep item stays navigable even if intermediate folders are
 * private and the user has no role on them directly.
 */
export async function getSpaceContentTree(
  spaceId: string,
  userId: string,
  platformRole: string | undefined,
  isOwner: boolean,
): Promise<{ folders: FolderNavNode[]; lists: ListNavNode[] }> {
  const [folderRows, listRows] = await Promise.all([
    db
      .select()
      .from(folders)
      .where(and(eq(folders.spaceId, spaceId), eq(folders.isArchived, false)))
      .orderBy(asc(folders.position), asc(folders.createdAt)),
    db
      .select()
      .from(lists)
      .where(and(eq(lists.spaceId, spaceId), eq(lists.isArchived, false)))
      .orderBy(asc(lists.position), asc(lists.createdAt)),
  ]);

  let visibleFolderIds: Set<string>;
  let visibleListIds: Set<string>;

  if (isOwner) {
    visibleFolderIds = new Set(folderRows.map((f) => f.id));
    visibleListIds = new Set(listRows.map((l) => l.id));
  } else {
    const [folderRoles, listRoles] = await Promise.all([
      Promise.all(folderRows.map((f) => getFolderRole(userId, f.id, platformRole))),
      Promise.all(listRows.map((l) => getListRole(userId, l.id, platformRole))),
    ]);
    const directFolderIds = new Set(
      folderRows.filter((_, i) => folderRoles[i] !== null).map((f) => f.id),
    );
    visibleListIds = new Set(listRows.filter((_, i) => listRoles[i] !== null).map((l) => l.id));

    const folderById = new Map(folderRows.map((f) => [f.id, f]));
    visibleFolderIds = new Set(directFolderIds);
    const markAncestors = (startFolderId: string | null) => {
      let folderId = startFolderId;
      while (folderId && !visibleFolderIds.has(folderId)) {
        visibleFolderIds.add(folderId);
        folderId = folderById.get(folderId)?.parentFolderId ?? null;
      }
    };
    for (const id of directFolderIds) markAncestors(folderById.get(id)?.parentFolderId ?? null);
    for (const l of listRows) if (visibleListIds.has(l.id)) markAncestors(l.folderId);
  }

  const listsByFolder = new Map<string | null, ListNavNode[]>();
  for (const l of listRows) {
    if (!visibleListIds.has(l.id)) continue;
    const arr = listsByFolder.get(l.folderId) ?? [];
    arr.push({ id: l.id, name: l.name, slug: l.slug, description: l.description });
    listsByFolder.set(l.folderId, arr);
  }

  const folderNodeById = new Map<string, FolderNavNode>();
  for (const f of folderRows) {
    if (!visibleFolderIds.has(f.id)) continue;
    folderNodeById.set(f.id, {
      id: f.id,
      name: f.name,
      slug: f.slug,
      isPrivate: f.isPrivate,
      subfolders: [],
      lists: listsByFolder.get(f.id) ?? [],
    });
  }
  const topFolders: FolderNavNode[] = [];
  for (const f of folderRows) {
    if (!visibleFolderIds.has(f.id)) continue;
    const node = folderNodeById.get(f.id)!;
    if (f.parentFolderId && folderNodeById.has(f.parentFolderId)) {
      folderNodeById.get(f.parentFolderId)!.subfolders.push(node);
    } else {
      topFolders.push(node);
    }
  }

  return { folders: topFolders, lists: listsByFolder.get(null) ?? [] };
}

export async function getTaskNavTreeForUser(user: SessionUserLike) {
  const candidateSpaces = await db
    .select({
      id: spaces.id,
      name: spaces.name,
      slug: spaces.slug,
      color: spaces.color,
    })
    .from(spaces)
    .where(eq(spaces.isArchived, false))
    .orderBy(asc(spaces.name));

  const roles = await Promise.all(
    candidateSpaces.map((space) => getSpaceRole(user.id, space.id, user.platformRole)),
  );
  const roleBySpaceId = new Map(candidateSpaces.map((space, i) => [space.id, roles[i]]));
  const visibleSpaces = candidateSpaces.filter((space) => roleBySpaceId.get(space.id) !== null);
  const visibleSpaceIds = new Set(visibleSpaces.map((space) => space.id));

  // Direct list/folder grants (list-only or folder-only sharing) can surface a space
  // the user otherwise has no role in at all.
  const groupRows = await db
    .select({ groupId: userGroupMemberships.groupId })
    .from(userGroupMemberships)
    .where(eq(userGroupMemberships.userId, user.id));
  const groupIds = groupRows.map((r) => r.groupId);

  const [directListSpaceRows, directFolderSpaceRows] = await Promise.all([
    db
      .select({ spaceId: lists.spaceId })
      .from(listMembers)
      .innerJoin(lists, eq(listMembers.listId, lists.id))
      .where(
        and(
          eq(lists.isArchived, false),
          or(
            eq(listMembers.userId, user.id),
            groupIds.length > 0 ? inArray(listMembers.groupId, groupIds) : undefined,
          ),
        ),
      ),
    db
      .select({ spaceId: folders.spaceId })
      .from(folderMembers)
      .innerJoin(folders, eq(folderMembers.folderId, folders.id))
      .where(
        and(
          eq(folders.isArchived, false),
          or(
            eq(folderMembers.userId, user.id),
            groupIds.length > 0 ? inArray(folderMembers.groupId, groupIds) : undefined,
          ),
        ),
      ),
  ]);

  const extraSpaceIds = new Set(
    [...directListSpaceRows, ...directFolderSpaceRows]
      .map((r) => r.spaceId)
      .filter((id) => !visibleSpaceIds.has(id)),
  );
  const extraSpaces = candidateSpaces.filter((space) => extraSpaceIds.has(space.id));
  const allSpaces = [...visibleSpaces, ...extraSpaces].sort((a, b) => a.name.localeCompare(b.name));
  if (allSpaces.length === 0) return [];

  const trees = await Promise.all(
    allSpaces.map((space) =>
      getSpaceContentTree(space.id, user.id, user.platformRole, roleBySpaceId.get(space.id) === "owner"),
    ),
  );

  return allSpaces.map((space, i) => ({
    ...space,
    hasSpaceAccess: visibleSpaceIds.has(space.id),
    isOwner: roleBySpaceId.get(space.id) === "owner",
    ...trees[i],
  }));
}

export const getListBySlug = cache(async (spaceId: string, slug: string) => {
  const [list] = await db
    .select()
    .from(lists)
    .where(and(eq(lists.spaceId, spaceId), eq(lists.slug, slug), eq(lists.isArchived, false)));
  return list ?? null;
});

export type ListViewType = "table" | "board";

export interface ListViewRow {
  id: string;
  listId: string;
  name: string;
  type: ListViewType;
  filters: unknown;
  groupBy: string | null;
  showClosed: boolean;
  tableColumnOrder: unknown;
  position: string;
}

/** All named views for a list, ordered by position. */
export async function getListViews(listId: string): Promise<ListViewRow[]> {
  const rows = await db
    .select({
      id: listViews.id,
      listId: listViews.listId,
      name: listViews.name,
      type: listViews.type,
      filters: listViews.filters,
      groupBy: listViews.groupBy,
      showClosed: listViews.showClosed,
      tableColumnOrder: listViews.tableColumnOrder,
      position: listViews.position,
    })
    .from(listViews)
    .where(eq(listViews.listId, listId))
    .orderBy(asc(listViews.position), asc(listViews.createdAt));

  return rows.map((r) => ({
    ...r,
    type: r.type === "board" ? "board" : "table",
  }));
}

/**
 * Ensure a list has at least one view (new lists created after migration).
 * Returns the views, creating List + Board defaults when empty.
 */
export async function ensureListViews(listId: string): Promise<ListViewRow[]> {
  const existing = await getListViews(listId);
  if (existing.length > 0) return existing;

  const [list] = await db.select().from(lists).where(eq(lists.id, listId));
  if (!list) return [];

  await db.insert(listViews).values([
    {
      listId,
      name: "List",
      type: "table",
      filters: [],
      groupBy: list.defaultGroupBy,
      showClosed: false,
      tableColumnOrder: list.tableColumnOrder,
      position: "a0",
    },
    {
      listId,
      name: "Board",
      type: "board",
      filters: [],
      groupBy: null,
      showClosed: false,
      tableColumnOrder: null,
      position: "a1",
    },
  ]);
  return getListViews(listId);
}

export const getStatusesForList = cache(async (listId: string) => {
  return db
    .select()
    .from(statuses)
    .where(eq(statuses.listId, listId))
    .orderBy(asc(statuses.position), asc(statuses.createdAt));
});

export const getFieldDefinitions = cache(async (listId: string, includeArchived = false) => {
  const rows = await db
    .select()
    .from(customFieldDefinitions)
    .where(eq(customFieldDefinitions.listId, listId))
    .orderBy(asc(customFieldDefinitions.position), asc(customFieldDefinitions.createdAt));
  return includeArchived ? rows : rows.filter((r) => !r.isArchived);
});

export interface TaskTag {
  id: string;
  name: string;
  color: string;
}

export interface TaskWithMeta {
  task: typeof tasks.$inferSelect;
  assignees: { id: string; displayName: string; photoKey: string | null }[];
  tags: TaskTag[];
}

async function attachAssignees(taskRows: (typeof tasks.$inferSelect)[]): Promise<TaskWithMeta[]> {
  if (taskRows.length === 0) return [];
  const taskIds = taskRows.map((t) => t.id);

  const [assigneeRows, tagRows] = await Promise.all([
    db
      .select({
        taskId: taskAssignees.taskId,
        id: users.id,
        displayName: users.displayName,
        photoKey: users.photoKey,
      })
      .from(taskAssignees)
      .innerJoin(users, eq(taskAssignees.userId, users.id))
      .where(inArray(taskAssignees.taskId, taskIds)),
    db
      .select({
        taskId: taskTags.taskId,
        id: tags.id,
        name: tags.name,
        color: tags.color,
      })
      .from(taskTags)
      .innerJoin(tags, eq(taskTags.tagId, tags.id))
      .where(inArray(taskTags.taskId, taskIds))
      .orderBy(asc(tags.name)),
  ]);

  const assigneesByTask = new Map<string, TaskWithMeta["assignees"]>();
  for (const row of assigneeRows) {
    const list = assigneesByTask.get(row.taskId) ?? [];
    list.push({ id: row.id, displayName: row.displayName, photoKey: row.photoKey });
    assigneesByTask.set(row.taskId, list);
  }
  const tagsByTask = new Map<string, TaskTag[]>();
  for (const row of tagRows) {
    const list = tagsByTask.get(row.taskId) ?? [];
    list.push({ id: row.id, name: row.name, color: row.color });
    tagsByTask.set(row.taskId, list);
  }
  return taskRows.map((task) => ({
    task,
    assignees: assigneesByTask.get(task.id) ?? [],
    tags: tagsByTask.get(task.id) ?? [],
  }));
}

/** All tags defined in a space (for pickers + filters). */
export const getTagsForSpace = cache(async (spaceId: string): Promise<TaskTag[]> => {
  return db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(tags)
    .where(eq(tags.spaceId, spaceId))
    .orderBy(asc(tags.name));
});

/** Tags currently on a single task. */
export async function getTagsForTask(taskId: string): Promise<TaskTag[]> {
  return db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(taskTags)
    .innerJoin(tags, eq(taskTags.tagId, tags.id))
    .where(eq(taskTags.taskId, taskId))
    .orderBy(asc(tags.name));
}

export async function getTasksForList(listId: string): Promise<TaskWithMeta[]> {
  const taskRows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.listId, listId), eq(tasks.isArchived, false)))
    .orderBy(asc(tasks.position), desc(tasks.createdAt));
  return attachAssignees(taskRows);
}

// ─── paginated, SQL-filtered task pages (scales to 100k+ rows per list) ────────

/** Mirror of the FilterBar's condition shape (kept here to avoid a client import). */
export interface TaskFilterCondition {
  field: string; // "status" | "priority" | "assignee" | `cf_${defId}`
  op: string;
  value: string;
  conjunction?: "and" | "or";
}

export interface TaskSortSpec {
  fieldId: string; // custom field definition id
  dir: "asc" | "desc";
}

type FieldDefRow = typeof customFieldDefinitions.$inferSelect;

/** SQL fragment for one filter condition. Unknown/valueless conditions become TRUE,
 * matching the previous in-JS behavior. */
function conditionSql(c: TaskFilterCondition, defsById: Map<string, FieldDefRow>) {
  const TRUE = sql`true`;
  if (!c.value && c.op !== "is_empty" && c.op !== "is_not_empty") return TRUE;

  if (c.field === "status") {
    return c.op === "is" ? sql`${tasks.statusId} = ${c.value}` : sql`${tasks.statusId} != ${c.value}`;
  }
  if (c.field === "priority") {
    return c.op === "is"
      ? sql`${tasks.priority} = ${c.value}`
      : sql`(${tasks.priority} IS NULL OR ${tasks.priority} != ${c.value})`;
  }
  if (c.field === "assignee") {
    const exists = sql`EXISTS (SELECT 1 FROM ${taskAssignees} ta WHERE ta.task_id = ${tasks.id} AND ta.user_id = ${c.value})`;
    return c.op === "is" ? exists : sql`NOT ${exists}`;
  }
  if (c.field === "tag") {
    const exists = sql`EXISTS (SELECT 1 FROM ${taskTags} tt WHERE tt.task_id = ${tasks.id} AND tt.tag_id = ${c.value})`;
    return c.op === "is" || c.op === "includes" ? exists : sql`NOT ${exists}`;
  }
  if (c.field.startsWith("cf_")) {
    const defId = c.field.slice(3);
    const def = defsById.get(defId);
    if (!def) return TRUE;
    const txt = sql`${tasks.customFields}->>${defId}`;
    switch (def.type) {
      case "dropdown":
      case "user":
        return c.op === "is" ? sql`${txt} = ${c.value}` : sql`(${txt} IS NULL OR ${txt} != ${c.value})`;
      case "multi_select": {
        const has = sql`(${tasks.customFields}->${defId}) ? ${c.value}`;
        return c.op === "includes" ? has : sql`NOT coalesce(${has}, false)`;
      }
      case "checkbox":
        return c.value === "true"
          ? sql`(${tasks.customFields}->${defId})::text = 'true'`
          : sql`coalesce((${tasks.customFields}->${defId})::text, 'false') != 'true'`;
      case "number": {
        const num = sql`NULLIF(${txt}, '')::numeric`;
        const target = Number(c.value);
        if (!Number.isFinite(target)) return TRUE;
        const ops: Record<string, ReturnType<typeof sql>> = {
          eq: sql`${num} = ${target}`,
          neq: sql`${num} != ${target}`,
          gt: sql`${num} > ${target}`,
          lt: sql`${num} < ${target}`,
          gte: sql`${num} >= ${target}`,
          lte: sql`${num} <= ${target}`,
        };
        return ops[c.op] ?? TRUE;
      }
      case "date": {
        const ops: Record<string, ReturnType<typeof sql>> = {
          is: sql`left(${txt}, 10) = ${c.value}`,
          before: sql`left(${txt}, 10) < ${c.value}`,
          after: sql`left(${txt}, 10) > ${c.value}`,
        };
        return ops[c.op] ?? TRUE;
      }
      default: {
        // text-ish types
        const like = `%${c.value}%`;
        const ops: Record<string, ReturnType<typeof sql>> = {
          contains: sql`${txt} ILIKE ${like}`,
          not_contains: sql`coalesce(${txt}, '') NOT ILIKE ${like}`,
          is: sql`lower(${txt}) = lower(${c.value})`,
          is_not: sql`lower(coalesce(${txt}, '')) != lower(${c.value})`,
        };
        return ops[c.op] ?? TRUE;
      }
    }
  }
  return TRUE;
}

/** Left-associative and/or chain, parenthesized to match the old client-side evaluation. */
function conditionsSql(conditions: TaskFilterCondition[], defsById: Map<string, FieldDefRow>) {
  if (conditions.length === 0) return sql`true`;
  let acc = conditionSql(conditions[0], defsById);
  for (let i = 1; i < conditions.length; i++) {
    const frag = conditionSql(conditions[i], defsById);
    acc = conditions[i].conjunction === "or" ? sql`(${acc} OR ${frag})` : sql`(${acc} AND ${frag})`;
  }
  return acc;
}

/** ORDER BY that puts grouped rows together (group key first), then stable list order. */
function orderSql(groupBy: string | undefined, sort: TaskSortSpec | null | undefined, defsById: Map<string, FieldDefRow>) {
  const parts: ReturnType<typeof sql>[] = [];
  if (groupBy === "status") {
    parts.push(
      sql`(SELECT s.position FROM ${statuses} s WHERE s.id = ${tasks.statusId}) ASC NULLS LAST`,
      sql`${tasks.statusId} ASC`,
    );
  } else if (groupBy === "priority") {
    parts.push(
      sql`CASE ${tasks.priority} WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 ELSE 4 END ASC`,
    );
  } else if (groupBy?.startsWith("cf_")) {
    const defId = groupBy.slice(3);
    parts.push(sql`${tasks.customFields}->>${defId} ASC NULLS LAST`);
  }
  if (sort) {
    const def = defsById.get(sort.fieldId);
    if (def) {
      const txt = sql`${tasks.customFields}->>${sort.fieldId}`;
      const expr = def.type === "number" ? sql`NULLIF(${txt}, '')::numeric` : txt;
      parts.push(sort.dir === "asc" ? sql`${expr} ASC NULLS LAST` : sql`${expr} DESC NULLS LAST`);
    }
  }
  parts.push(sql`${tasks.position} ASC`, sql`${tasks.createdAt} DESC`, sql`${tasks.id} ASC`);
  return sql.join(parts, sql`, `);
}

export interface TaskPage {
  items: TaskWithMeta[];
  total: number;
  /** Present when groupBy was requested: total rows per group key (statusId / priority / cf value). */
  groupCounts: { key: string; count: number }[] | null;
}

export async function getTasksPage(params: {
  listId: string;
  conditions?: TaskFilterCondition[];
  groupBy?: string;
  sort?: TaskSortSpec | null;
  limit: number;
  offset: number;
  /**
   * When false (default), tasks whose status category is `done` or `cancelled`
   * are excluded — matching ClickUp's "closed tasks are hidden" list behavior.
   * Pass true (e.g. URL `closed=1`) to include them.
   */
  showClosed?: boolean;
  /** Skip the count/groupCounts queries (used by follow-up pages). */
  countsAlreadyKnown?: boolean;
}): Promise<TaskPage> {
  const { listId, conditions = [], groupBy, sort, limit, offset, showClosed = false } = params;
  const defs = await getFieldDefinitions(listId, true);
  const defsById = new Map(defs.map((d) => [d.id, d]));

  // Closed = status categories done | cancelled (ClickUp "Closed" group).
  const openOnlySql = showClosed
    ? sql`true`
    : sql`EXISTS (
        SELECT 1 FROM ${statuses} s
        WHERE s.id = ${tasks.statusId}
          AND s.category NOT IN ('done', 'cancelled')
      )`;

  const where = sql`${tasks.listId} = ${listId} AND ${tasks.isArchived} = false AND (${openOnlySql}) AND (${conditionsSql(conditions, defsById)})`;

  const rows = await db
    .select()
    .from(tasks)
    .where(where)
    .orderBy(orderSql(groupBy, sort, defsById))
    .limit(limit)
    .offset(offset);
  const items = await attachAssignees(rows);

  if (params.countsAlreadyKnown) return { items, total: -1, groupCounts: null };

  const [{ count: total }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tasks)
    .where(where);

  let groupCounts: TaskPage["groupCounts"] = null;
  if (groupBy) {
    // Grouped by the RAW column (so ORDER BY subqueries may reference it), with an
    // ordering identical to orderSql's group ordering — the client uses this to
    // compute every group's absolute row offset without loading the rows.
    let grouped: { key: string | null; count: number }[];
    if (groupBy === "status") {
      grouped = await db
        .select({ key: sql<string | null>`${tasks.statusId}::text`, count: sql<number>`count(*)::int` })
        .from(tasks)
        .where(where)
        .groupBy(tasks.statusId)
        .orderBy(sql`(SELECT s.position FROM ${statuses} s WHERE s.id = ${tasks.statusId}) ASC NULLS LAST`, sql`${tasks.statusId} ASC`);
    } else if (groupBy === "priority") {
      grouped = await db
        .select({ key: sql<string | null>`${tasks.priority}::text`, count: sql<number>`count(*)::int` })
        .from(tasks)
        .where(where)
        .groupBy(tasks.priority)
        .orderBy(sql`CASE ${tasks.priority} WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 ELSE 4 END ASC`);
    } else if (groupBy.startsWith("cf_")) {
      const keyExpr = sql`${tasks.customFields}->>${groupBy.slice(3)}`;
      grouped = await db
        .select({ key: sql<string | null>`${keyExpr}`, count: sql<number>`count(*)::int` })
        .from(tasks)
        .where(where)
        .groupBy(keyExpr)
        .orderBy(sql`${keyExpr} ASC NULLS LAST`);
    } else {
      grouped = [{ key: null, count: total }];
    }
    groupCounts = grouped.map((g) => ({ key: g.key ?? "__none__", count: g.count }));
  }

  return { items, total, groupCounts };
}

export const getTaskByNumber = cache(async (number: string) => {
  const [task] = await db.select().from(tasks).where(eq(tasks.number, number));
  return task ?? null;
});

export async function getTaskActivity(taskId: string, limit = 50) {
  return db
    .select({
      id: activityLog.id,
      verb: activityLog.verb,
      payload: activityLog.payload,
      actorId: activityLog.actorId,
      actorLabel: activityLog.actorLabel,
      createdAt: activityLog.createdAt,
      actorName: users.displayName,
      actorPhotoKey: users.photoKey,
    })
    .from(activityLog)
    .leftJoin(users, eq(activityLog.actorId, users.id))
    .where(eq(activityLog.taskId, taskId))
    .orderBy(desc(activityLog.id))
    .limit(limit);
}

export const getActiveUsers = cache(async () => {
  return db
    .select({ id: users.id, displayName: users.displayName, photoKey: users.photoKey })
    .from(users)
    .where(eq(users.isActive, true))
    .orderBy(asc(users.displayName));
});

/**
 * Expand membership rows that may point at a user OR an Entra group into
 * concrete active user ids.
 */
async function expandMemberUserIds(
  rows: { userId: string | null; groupId: string | null }[],
): Promise<Set<string>> {
  const ids = new Set<string>();
  const groupIds: string[] = [];
  for (const r of rows) {
    if (r.userId) ids.add(r.userId);
    if (r.groupId) groupIds.push(r.groupId);
  }
  if (groupIds.length > 0) {
    const groupUsers = await db
      .select({ userId: userGroupMemberships.userId })
      .from(userGroupMemberships)
      .where(inArray(userGroupMemberships.groupId, groupIds));
    for (const g of groupUsers) ids.add(g.userId);
  }
  return ids;
}

/**
 * Users who can access a list (and therefore its tasks) — mirrors RBAC:
 * platform admins, space owners always; private lists only + direct list
 * members; otherwise space/folder inheritance along the parent chain.
 * Used for @-mention pickers so we never offer people without access.
 */
export async function getUsersWithListAccess(
  listId: string,
): Promise<{ id: string; displayName: string; photoKey: string | null }[]> {
  const [list] = await db.select().from(lists).where(eq(lists.id, listId));
  if (!list) return [];

  const candidateIds = new Set<string>();

  // Platform admins always have access.
  const admins = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.isActive, true), eq(users.platformRole, "admin")));
  for (const a of admins) candidateIds.add(a.id);

  // Space memberships (user + group).
  const spaceMemberRows = await db
    .select({
      userId: spaceMembers.userId,
      groupId: spaceMembers.groupId,
      role: spaceMembers.role,
    })
    .from(spaceMembers)
    .where(eq(spaceMembers.spaceId, list.spaceId));

  const spaceOwnerRows = spaceMemberRows.filter((r) => r.role === "owner");
  const spaceOwnerIds = await expandMemberUserIds(spaceOwnerRows);
  for (const id of spaceOwnerIds) candidateIds.add(id);

  // Direct list members (always relevant; for private lists they are the only non-owner path).
  const listMemberRows = await db
    .select({ userId: listMembers.userId, groupId: listMembers.groupId })
    .from(listMembers)
    .where(eq(listMembers.listId, listId));
  const listMemberIds = await expandMemberUserIds(listMemberRows);
  for (const id of listMemberIds) candidateIds.add(id);

  if (!list.isPrivate) {
    // Walk folder chain: private folders only contribute their members;
    // non-private folders also inherit parent access; space root = all space members.
    let folderId: string | null = list.folderId;
    let hitPrivateFolder = false;

    while (folderId) {
      const [folder] = await db.select().from(folders).where(eq(folders.id, folderId));
      if (!folder) break;

      const folderMemberRows = await db
        .select({ userId: folderMembers.userId, groupId: folderMembers.groupId })
        .from(folderMembers)
        .where(eq(folderMembers.folderId, folderId));
      const folderMemberIds = await expandMemberUserIds(folderMemberRows);
      for (const id of folderMemberIds) candidateIds.add(id);

      if (folder.isPrivate) {
        hitPrivateFolder = true;
        break; // parent roles do not pierce private folders
      }
      folderId = folder.parentFolderId;
    }

    if (!hitPrivateFolder) {
      // Full space membership can see this list.
      const allSpaceIds = await expandMemberUserIds(spaceMemberRows);
      for (const id of allSpaceIds) candidateIds.add(id);
    }
  }

  if (candidateIds.size === 0) return [];

  return db
    .select({ id: users.id, displayName: users.displayName, photoKey: users.photoKey })
    .from(users)
    .where(and(eq(users.isActive, true), inArray(users.id, [...candidateIds])))
    .orderBy(asc(users.displayName));
}

export interface SpaceMemberRow {
  id: string;
  role: "owner" | "member" | "guest";
  userId: string | null;
  displayName: string;
  email: string | null;
}

export const getSpaceMembers = cache(async (spaceId: string): Promise<SpaceMemberRow[]> => {
  const rows = await db
    .select({
      id: spaceMembers.id,
      role: spaceMembers.role,
      userId: spaceMembers.userId,
      displayName: users.displayName,
      email: users.email,
    })
    .from(spaceMembers)
    .innerJoin(users, eq(spaceMembers.userId, users.id))
    .where(eq(spaceMembers.spaceId, spaceId))
    .orderBy(asc(users.displayName));
  return rows;
});

export const getListMembers = cache(async (listId: string): Promise<SpaceMemberRow[]> => {
  const rows = await db
    .select({
      id: listMembers.id,
      role: listMembers.role,
      userId: listMembers.userId,
      displayName: users.displayName,
      email: users.email,
    })
    .from(listMembers)
    .innerJoin(users, eq(listMembers.userId, users.id))
    .where(eq(listMembers.listId, listId))
    .orderBy(asc(users.displayName));
  return rows;
});

export const getFolderMembers = cache(async (folderId: string): Promise<SpaceMemberRow[]> => {
  const rows = await db
    .select({
      id: folderMembers.id,
      role: folderMembers.role,
      userId: folderMembers.userId,
      displayName: users.displayName,
      email: users.email,
    })
    .from(folderMembers)
    .innerJoin(users, eq(folderMembers.userId, users.id))
    .where(eq(folderMembers.folderId, folderId))
    .orderBy(asc(users.displayName));
  return rows;
});

export async function getTaskComments(taskId: string) {
  const { comments } = await import("@aitim/db");
  const { isNull } = await import("drizzle-orm");
  return db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      editedAt: comments.editedAt,
      authorId: comments.authorId,
      authorName: users.displayName,
      authorPhotoKey: users.photoKey,
    })
    .from(comments)
    .innerJoin(users, eq(comments.authorId, users.id))
    .where(and(eq(comments.taskId, taskId), isNull(comments.deletedAt)))
    .orderBy(asc(comments.createdAt));
}

export async function getTaskAttachments(taskId: string) {
  const { attachments } = await import("@aitim/db");
  return db
    .select({
      id: attachments.id,
      fileName: attachments.fileName,
      mimeType: attachments.mimeType,
      sizeBytes: attachments.sizeBytes,
      createdAt: attachments.createdAt,
      uploaderName: users.displayName,
    })
    .from(attachments)
    .leftJoin(users, eq(attachments.uploaderId, users.id))
    .where(eq(attachments.taskId, taskId))
    .orderBy(asc(attachments.createdAt));
}

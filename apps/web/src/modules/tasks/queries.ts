import {
  activityLog,
  customFieldDefinitions,
  db,
  lists,
  spaces,
  statuses,
  taskAssignees,
  tasks,
  users,
} from "@aitim/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { cache } from "react";

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

export const getListBySlug = cache(async (spaceId: string, slug: string) => {
  const [list] = await db
    .select()
    .from(lists)
    .where(and(eq(lists.spaceId, spaceId), eq(lists.slug, slug), eq(lists.isArchived, false)));
  return list ?? null;
});

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

export interface TaskWithMeta {
  task: typeof tasks.$inferSelect;
  assignees: { id: string; displayName: string; photoKey: string | null }[];
}

export async function getTasksForList(listId: string): Promise<TaskWithMeta[]> {
  const taskRows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.listId, listId), eq(tasks.isArchived, false)))
    .orderBy(asc(tasks.position), desc(tasks.createdAt));

  if (taskRows.length === 0) return [];
  const assigneeRows = await db
    .select({
      taskId: taskAssignees.taskId,
      id: users.id,
      displayName: users.displayName,
      photoKey: users.photoKey,
    })
    .from(taskAssignees)
    .innerJoin(users, eq(taskAssignees.userId, users.id))
    .where(
      inArray(
        taskAssignees.taskId,
        taskRows.map((t) => t.id),
      ),
    );

  const byTask = new Map<string, TaskWithMeta["assignees"]>();
  for (const row of assigneeRows) {
    const list = byTask.get(row.taskId) ?? [];
    list.push({ id: row.id, displayName: row.displayName, photoKey: row.photoKey });
    byTask.set(row.taskId, list);
  }
  return taskRows.map((task) => ({ task, assignees: byTask.get(task.id) ?? [] }));
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
      actorLabel: activityLog.actorLabel,
      createdAt: activityLog.createdAt,
      actorName: users.displayName,
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

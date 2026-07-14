/**
 * Dev seed: tasks module + demo Safety space with a "Customer Requests" list,
 * statuses, custom fields, a dev user, and a couple of tasks.
 * Idempotent: safe to run repeatedly.
 */
import { eq } from "drizzle-orm";
import { db, getPool } from "./index";
import {
  customFieldDefinitions,
  lists,
  modules,
  spaceMembers,
  spaces,
  spaceTaskCounters,
  statuses,
  taskAssignees,
  tasks,
  users,
} from "./schema/index";

async function main() {
  // Module registry
  const [tasksModule] = await db
    .insert(modules)
    .values({ slug: "tasks", name: "Tasks" })
    .onConflictDoUpdate({ target: modules.slug, set: { name: "Tasks" } })
    .returning();

  // Dev user (stands in for an Entra-synced user locally)
  let [admin] = await db.select().from(users).where(eq(users.email, "dev@aitim.local"));
  if (!admin) {
    [admin] = await db
      .insert(users)
      .values({
        email: "dev@aitim.local",
        displayName: "Dev Admin",
        jobTitle: "Developer",
        department: "IT",
        platformRole: "admin",
        isProtectedAdmin: true,
      })
      .returning();
  }

  // Safety space
  const existingSpace = await db.select().from(spaces).where(eq(spaces.slug, "safety"));
  let space = existingSpace[0];
  if (!space) {
    [space] = await db
      .insert(spaces)
      .values({
        moduleId: tasksModule.id,
        name: "Safety",
        slug: "safety",
        taskPrefix: "SAF",
        icon: "shield",
        color: "#e11d48",
        createdBy: admin.id,
      })
      .returning();
    await db.insert(spaceTaskCounters).values({ spaceId: space.id });
    await db.insert(spaceMembers).values({
      spaceId: space.id,
      principalType: "user",
      userId: admin.id,
      role: "owner",
    });
  }

  // Customer Requests list
  const existingList = await db.select().from(lists).where(eq(lists.spaceId, space.id));
  let list = existingList[0];
  if (!list) {
    [list] = await db
      .insert(lists)
      .values({ spaceId: space.id, name: "Customer Requests", slug: "customer-requests" })
      .returning();

    const statusRows = await db
      .insert(statuses)
      .values([
        { listId: list.id, name: "New", color: "#64748b", category: "open", position: "a0" },
        { listId: list.id, name: "In Review", color: "#f59e0b", category: "active", position: "a1" },
        { listId: list.id, name: "In Progress", color: "#3b82f6", category: "active", position: "a2" },
        { listId: list.id, name: "Completed", color: "#22c55e", category: "done", position: "a3" },
        { listId: list.id, name: "Rejected", color: "#ef4444", category: "cancelled", position: "a4" },
      ])
      .returning();

    await db.update(lists).set({ defaultStatusId: statusRows[0].id }).where(eq(lists.id, list.id));

    const [requestType] = await db
      .insert(customFieldDefinitions)
      .values([
        {
          listId: list.id,
          key: "request_type",
          label: "Request type",
          type: "dropdown",
          isRequired: true,
          position: "a0",
          options: [
            { id: "incident", label: "Incident report", color: "#ef4444" },
            { id: "inspection", label: "Inspection request", color: "#3b82f6" },
            { id: "training", label: "Training request", color: "#22c55e" },
            { id: "other", label: "Other", color: "#94a3b8" },
          ],
        },
        {
          listId: list.id,
          key: "customer_name",
          label: "Customer name",
          type: "text",
          isRequired: true,
          position: "a1",
        },
        {
          listId: list.id,
          key: "customer_email",
          label: "Customer email",
          type: "email",
          isRequired: false,
          position: "a2",
        },
        {
          listId: list.id,
          key: "inspector",
          label: "Inspector",
          type: "user",
          isRequired: false,
          position: "a3",
        },
      ])
      .returning();

    const [demoTask] = await db
      .insert(tasks)
      .values({
        listId: list.id,
        number: "SAF-1",
        title: "Demo: annual fire safety inspection request",
        statusId: statusRows[0].id,
        priority: "high",
        createdBy: admin.id,
        customFields: {
          [requestType.id]: "inspection",
        },
      })
      .returning();
    await db
      .update(spaceTaskCounters)
      .set({ nextNumber: 2 })
      .where(eq(spaceTaskCounters.spaceId, space.id));
    await db.insert(taskAssignees).values({
      taskId: demoTask.id,
      userId: admin.id,
      assignedBy: admin.id,
    });
  }

  console.log("Seed complete.");
  await getPool().end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

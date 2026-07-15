/**
 * Sample data for the Safety space: extra custom fields and a batch of
 * realistic customer-request tasks with statuses, priorities, assignees,
 * custom field values, comments, and activity.
 * Idempotent: skips tasks whose title already exists.
 * Run: pnpm --filter @aitim/db seed:sample
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { db, getPool } from "./index";
import {
  activityLog,
  comments,
  customFieldDefinitions,
  lists,
  spaces,
  spaceTaskCounters,
  statuses,
  taskAssignees,
  tasks,
  users,
} from "./schema/index";

const EXTRA_FIELDS = [
  {
    key: "severity",
    label: "Severity",
    type: "dropdown" as const,
    isRequired: false,
    position: "a4",
    options: [
      { id: "low", label: "Low", color: "#94a3b8" },
      { id: "medium", label: "Medium", color: "#f59e0b" },
      { id: "high", label: "High", color: "#f97316" },
      { id: "critical", label: "Critical", color: "#ef4444" },
    ],
  },
  {
    key: "site_location",
    label: "Site location",
    type: "text" as const,
    isRequired: false,
    position: "a5",
    options: null,
  },
  {
    key: "customer_phone",
    label: "Customer phone",
    type: "phone" as const,
    isRequired: false,
    position: "a6",
    options: null,
  },
  {
    key: "follow_up_required",
    label: "Follow-up required",
    type: "checkbox" as const,
    isRequired: false,
    position: "a7",
    options: null,
  },
];

interface SampleTask {
  title: string;
  status: string;
  priority: "urgent" | "high" | "normal" | "low" | null;
  dueInDays: number | null;
  requestType: "incident" | "inspection" | "training" | "other";
  severity: "low" | "medium" | "high" | "critical";
  customer: string;
  customerEmail: string;
  location: string;
  phone: string;
  followUp: boolean;
  assignees: number; // how many random users
  comment?: string;
}

const SAMPLE_TASKS: SampleTask[] = [
  { title: "Forklift near-miss reported at Warehouse B", status: "In Review", priority: "urgent", dueInDays: 1, requestType: "incident", severity: "critical", customer: "Northline Logistics", customerEmail: "ops@northline.example", location: "Warehouse B, Dock 4", phone: "+1 410 555 0187", followUp: true, assignees: 2, comment: "Customer sent CCTV footage — reviewing before the site visit." },
  { title: "Annual fire extinguisher inspection — main office", status: "In Progress", priority: "high", dueInDays: 3, requestType: "inspection", severity: "medium", customer: "Harborview Medical Group", customerEmail: "facilities@harborview.example", location: "1200 Coastal Hwy, Suite 300", phone: "+1 410 555 0122", followUp: false, assignees: 1 },
  { title: "OSHA forklift certification training for 12 operators", status: "New", priority: "normal", dueInDays: 14, requestType: "training", severity: "low", customer: "Delta Freight Co", customerEmail: "hr@deltafreight.example", location: "Client site — Baltimore terminal", phone: "+1 443 555 0170", followUp: false, assignees: 1 },
  { title: "Chemical spill containment review after minor leak", status: "In Progress", priority: "urgent", dueInDays: 2, requestType: "incident", severity: "high", customer: "ChemPro Industries", customerEmail: "ehs@chempro.example", location: "Plant 2, mixing room", phone: "+1 410 555 0195", followUp: true, assignees: 2, comment: "Containment berms ordered; interim procedure shared with the customer." },
  { title: "Quarterly scaffold inspection — Tower Crane site", status: "Completed", priority: "high", dueInDays: -7, requestType: "inspection", severity: "medium", customer: "Meridian Construction", customerEmail: "site@meridian.example", location: "45 Harbor Point", phone: "+1 443 555 0114", followUp: false, assignees: 1 },
  { title: "First-aid & CPR refresher for night shift", status: "Completed", priority: "normal", dueInDays: -14, requestType: "training", severity: "low", customer: "Northline Logistics", customerEmail: "ops@northline.example", location: "AITIM training center", phone: "+1 410 555 0187", followUp: false, assignees: 1 },
  { title: "Noise level assessment request — stamping line", status: "New", priority: "normal", dueInDays: 10, requestType: "inspection", severity: "medium", customer: "Atlas Metalworks", customerEmail: "plant@atlasmetal.example", location: "Stamping hall, line 3", phone: "+1 410 555 0139", followUp: false, assignees: 0 },
  { title: "Employee reported faulty emergency lighting in stairwell", status: "In Review", priority: "high", dueInDays: 4, requestType: "incident", severity: "medium", customer: "Bayside Property Mgmt", customerEmail: "maint@bayside.example", location: "Building C, stairwell 2", phone: "+1 443 555 0161", followUp: true, assignees: 1 },
  { title: "Lockout/tagout program audit", status: "New", priority: "high", dueInDays: 21, requestType: "inspection", severity: "high", customer: "ChemPro Industries", customerEmail: "ehs@chempro.example", location: "Plant 1 & 2", phone: "+1 410 555 0195", followUp: false, assignees: 0 },
  { title: "Request for confined-space entry training", status: "New", priority: "low", dueInDays: 30, requestType: "training", severity: "low", customer: "Meridian Construction", customerEmail: "site@meridian.example", location: "AITIM training center", phone: "+1 443 555 0114", followUp: false, assignees: 0 },
  { title: "Slip-and-fall incident in customer cafeteria", status: "Rejected", priority: "normal", dueInDays: -3, requestType: "incident", severity: "low", customer: "Bayside Property Mgmt", customerEmail: "maint@bayside.example", location: "HQ cafeteria", phone: "+1 443 555 0161", followUp: false, assignees: 1, comment: "Outside our service contract scope — referred to the customer's own facilities team." },
  { title: "PPE compliance walkthrough before client audit", status: "In Progress", priority: "high", dueInDays: 5, requestType: "inspection", severity: "medium", customer: "Delta Freight Co", customerEmail: "hr@deltafreight.example", location: "Baltimore terminal", phone: "+1 443 555 0170", followUp: true, assignees: 2 },
];

async function main() {
  const [space] = await db.select().from(spaces).where(eq(spaces.slug, "safety"));
  if (!space) throw new Error("Safety space not found — run pnpm db:seed first");
  const [list] = await db
    .select()
    .from(lists)
    .where(and(eq(lists.spaceId, space.id), eq(lists.slug, "customer-requests")));
  if (!list) throw new Error("Customer Requests list not found");

  // 1. Extra custom fields
  for (const f of EXTRA_FIELDS) {
    await db
      .insert(customFieldDefinitions)
      .values({ listId: list.id, ...f })
      .onConflictDoNothing();
  }

  const defs = await db
    .select()
    .from(customFieldDefinitions)
    .where(eq(customFieldDefinitions.listId, list.id));
  const defByKey = new Map(defs.map((d) => [d.key, d]));
  const listStatuses = await db.select().from(statuses).where(eq(statuses.listId, list.id));
  const statusByName = new Map(listStatuses.map((s) => [s.name, s]));

  // Real users to assign (prefer synced Entra users, fall back to any active)
  const activeUsers = await db
    .select()
    .from(users)
    .where(eq(users.isActive, true))
    .orderBy(asc(users.displayName));
  const pool = activeUsers.filter((u) => u.entraObjectId).slice(0, 20);
  const assignPool = pool.length > 0 ? pool : activeUsers;
  const author = activeUsers.find((u) => u.email === "kim@aitimgroup.com") ?? activeUsers[0];

  let created = 0;
  for (const [i, t] of SAMPLE_TASKS.entries()) {
    const exists = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.listId, list.id), eq(tasks.title, t.title)));
    if (exists.length > 0) continue;

    const status = statusByName.get(t.status);
    if (!status) continue;

    const dueDate = t.dueInDays
      ? new Date(Date.now() + t.dueInDays * 86_400_000).toISOString().slice(0, 10)
      : null;
    const assigneeUsers = Array.from(
      { length: t.assignees },
      (_, k) => assignPool[(i * 3 + k * 7) % assignPool.length],
    );
    const inspector = assigneeUsers[0];

    const customFields: Record<string, unknown> = {};
    const set = (key: string, value: unknown) => {
      const def = defByKey.get(key);
      if (def && value !== undefined && value !== null) customFields[def.id] = value;
    };
    set("request_type", t.requestType);
    set("customer_name", t.customer);
    set("customer_email", t.customerEmail);
    set("severity", t.severity);
    set("site_location", t.location);
    set("customer_phone", t.phone);
    set("follow_up_required", t.followUp);
    if (inspector) set("inspector", inspector.id);

    await db.transaction(async (tx) => {
      const [counter] = await tx
        .update(spaceTaskCounters)
        .set({ nextNumber: sql`${spaceTaskCounters.nextNumber} + 1` })
        .where(eq(spaceTaskCounters.spaceId, space.id))
        .returning({ next: spaceTaskCounters.nextNumber });
      const number = `${space.taskPrefix}-${counter.next - 1}`;

      const [task] = await tx
        .insert(tasks)
        .values({
          listId: list.id,
          number,
          title: t.title,
          statusId: status.id,
          priority: t.priority,
          dueDate,
          customFields,
          createdBy: author.id,
          source: "manual",
          completedAt: status.category === "done" ? new Date() : null,
        })
        .returning();

      for (const u of assigneeUsers) {
        await tx
          .insert(taskAssignees)
          .values({ taskId: task.id, userId: u.id, assignedBy: author.id })
          .onConflictDoNothing();
      }

      await tx.insert(activityLog).values({
        spaceId: space.id,
        taskId: task.id,
        actorId: author.id,
        verb: "task.created",
        payload: { title: t.title, number },
      });

      if (t.comment) {
        await tx.insert(comments).values({
          taskId: task.id,
          authorId: (assigneeUsers[0] ?? author).id,
          body: { text: t.comment },
        });
        await tx.insert(activityLog).values({
          spaceId: space.id,
          taskId: task.id,
          actorId: (assigneeUsers[0] ?? author).id,
          verb: "comment.created",
          payload: { preview: t.comment.slice(0, 140) },
        });
      }
    });
    created++;
  }

  console.log(`Sample data ready: ${created} tasks created (${SAMPLE_TASKS.length - created} already existed), ${EXTRA_FIELDS.length} extra field definitions ensured.`);
  await getPool().end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

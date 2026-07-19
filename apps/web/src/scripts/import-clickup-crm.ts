/**
 * Imports the ClickUp "Companies" and "🧑🏼‍⚖️ Lawyers" lists into a new "CRM"
 * space. Reads pre-fetched JSON from the scratchpad (companies_*.json,
 * lawyers_*.json — see cu_fetch_list.py). Credential-bearing fields are
 * deliberately NOT imported.
 *
 * Usage: tsx src/scripts/import-clickup-crm.ts
 * Idempotent via the "ClickUp URL" custom field.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  customFieldDefinitions,
  db,
  getPool,
  lists,
  modules,
  spaceMembers,
  spaces,
  spaceTaskCounters,
  statuses,
  taskAssignees,
  tasks,
  users,
} from "@aitim/db";
import { and, eq, sql } from "drizzle-orm";

const SCRATCH =
  "/private/tmp/claude-501/-Users-kgurinov-Documents-Coding-aitim-intranet/3108427d-5d24-4225-8a15-91c1017f7fb3/scratchpad";

const EMAIL_ALIASES: Record<string, string> = {
  "kgurinov@gurver.org": "kim@aitimgroup.com",
  "itops@aitimgroup.com": "itops_aitimgroup.com#EXT#@itopsaitimgroup.onmicrosoft.com",
};

interface CuOption {
  id: string;
  name?: string;
  label?: string;
  color?: string;
  orderindex?: number | string;
}
interface CuField {
  id: string;
  name: string;
  type: string;
  type_config?: { options?: CuOption[] };
  value?: unknown;
}
interface CuTask {
  id: string;
  name: string;
  description?: string;
  status: { status: string };
  date_created: string;
  date_updated?: string;
  date_closed?: string | null;
  due_date?: string | null;
  start_date?: string | null;
  priority?: { priority: string } | null;
  assignees: { email?: string | null; username?: string | null }[];
  creator?: { email?: string | null; username?: string | null } | null;
  custom_fields: CuField[];
  url: string;
}

/** cuName is matched after .trim() (some ClickUp field names have trailing spaces). */
interface FieldSpec {
  cuName: string;
  key: string;
  label: string;
  type: "text" | "number" | "date" | "dropdown" | "multi_select" | "checkbox" | "url" | "email" | "phone";
}

interface ListSpec {
  filePrefix: string;
  name: string;
  slug: string;
  statuses: { cu: string; name: string; color: string; category: "open" | "active" | "done" | "cancelled" }[];
  fields: FieldSpec[];
}

const COMPANIES: ListSpec = {
  filePrefix: "companies",
  name: "Companies",
  slug: "companies",
  statuses: [
    { cu: "new company", name: "New Company", color: "#87909e", category: "open" },
    { cu: "active company", name: "Active Company", color: "#0f9d9f", category: "active" },
    { cu: "active comany with service", name: "Active With Service", color: "#f8ae00", category: "active" },
    { cu: "on hold company", name: "On Hold", color: "#aa8d80", category: "active" },
    { cu: "closed company", name: "Closed", color: "#008844", category: "done" },
  ],
  fields: [
    { cuName: "Contact Name", key: "contact_name", label: "Contact Name", type: "text" },
    { cuName: "Phone", key: "phone", label: "Phone", type: "phone" },
    { cuName: "Phone 2", key: "phone_2", label: "Phone 2", type: "phone" },
    { cuName: "Email 1", key: "email_1", label: "Email 1", type: "email" },
    { cuName: "Email", key: "email", label: "Email", type: "email" },
    { cuName: "Email 2", key: "email_2", label: "Email 2", type: "email" },
    { cuName: "Billing Address", key: "billing_address", label: "Billing Address", type: "text" },
    { cuName: "Shipping Address", key: "shipping_address", label: "Shipping Address", type: "text" },
    { cuName: "Main office", key: "main_office", label: "Main Office", type: "text" },
    { cuName: "President", key: "president", label: "President", type: "text" },
    { cuName: "DOT", key: "dot", label: "DOT", type: "text" },
    { cuName: "👍 MC", key: "mc", label: "MC", type: "text" },
    { cuName: "TMS", key: "tms", label: "TMS", type: "dropdown" },
    { cuName: "❓ Company Type", key: "company_type", label: "Company Type", type: "dropdown" },
    { cuName: "Industry", key: "industry", label: "Industry", type: "dropdown" },
    { cuName: "Customer Status", key: "customer_status", label: "Customer Status", type: "dropdown" },
    { cuName: "KIM Category", key: "kim_category", label: "KIM Category", type: "dropdown" },
    { cuName: "Lead Source", key: "lead_source", label: "Lead Source", type: "dropdown" },
    { cuName: "🛒 Services", key: "services", label: "Services", type: "multi_select" },
    { cuName: "🛒 Safety Sub Service", key: "safety_sub_service", label: "Safety Sub Service", type: "multi_select" },
    { cuName: "🛒 Safety Level Package", key: "safety_level_package", label: "Safety Level Package", type: "dropdown" },
    { cuName: "Potential", key: "potential", label: "Potential", type: "multi_select" },
    { cuName: "👷 # Drivers", key: "num_drivers", label: "# Drivers", type: "number" },
    { cuName: "🚚 # Trucks", key: "num_trucks", label: "# Trucks", type: "number" },
    { cuName: "Discount %", key: "discount_pct", label: "Discount %", type: "number" },
    { cuName: "Safety Setup Form Link", key: "safety_setup_form", label: "Safety Setup Form Link", type: "text" },
    { cuName: "Last Activity Time", key: "last_activity", label: "Last Activity", type: "date" },
    { cuName: "Date Service Start", key: "service_start", label: "Date Service Start", type: "date" },
    { cuName: "⚙️ ELD Service Added", key: "eld_added", label: "ELD Service Added", type: "date" },
    { cuName: "⚙️ ELD Service Removed", key: "eld_removed", label: "ELD Service Removed", type: "date" },
    { cuName: "⚙️ Safety Service Added", key: "safety_added", label: "Safety Service Added", type: "date" },
    { cuName: "⚙️ Safety Service Removed", key: "safety_removed", label: "Safety Service Removed", type: "date" },
  ],
};

const LAWYERS: ListSpec = {
  filePrefix: "lawyers",
  name: "Lawyers",
  slug: "lawyers",
  statuses: [
    { cu: "new lawyer", name: "New Lawyer", color: "#f8ae00", category: "open" },
    { cu: "active lawyer", name: "Active Lawyer", color: "#5f55ee", category: "active" },
    { cu: "inactive lawyer", name: "Inactive Lawyer", color: "#008844", category: "done" },
  ],
  fields: [
    { cuName: "County", key: "county", label: "County", type: "text" },
    { cuName: "State (List)", key: "state", label: "State", type: "dropdown" },
    { cuName: "Contact Phone Number", key: "phone", label: "Phone", type: "phone" },
    { cuName: "Additional Phone Number", key: "phone_2", label: "Additional Phone", type: "phone" },
    { cuName: "Email Address", key: "email", label: "Email", type: "email" },
    { cuName: "Website", key: "website", label: "Website", type: "url" },
    { cuName: "👁️‍🗨️ Link to BMS", key: "bms_link", label: "BMS Link", type: "url" },
    { cuName: "⭐ Rating", key: "rating", label: "Rating", type: "number" },
  ],
};

function msToDateStr(ms: unknown): string | null {
  if (!ms) return null;
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n).toISOString().slice(0, 10);
}
function msToDate(ms: unknown): Date | null {
  if (!ms) return null;
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n);
}
/** The app's body/description convention is a plain `{ text }` object. */
function textToTiptap(text: string): unknown {
  return { text: text.replace(/\r\n/g, "\n") };
}
function normEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const e = raw.trim().toLowerCase();
  return EMAIL_ALIASES[e]?.toLowerCase() ?? e;
}

async function loadUsersByEmail(): Promise<Map<string, string>> {
  const rows = await db.select({ id: users.id, email: users.email }).from(users);
  return new Map(rows.map((r) => [r.email.toLowerCase(), r.id]));
}

async function ensureCrmSpace(ownerId: string) {
  let [space] = await db.select().from(spaces).where(eq(spaces.slug, "crm"));
  if (space) return space;
  const [tasksModule] = await db.select().from(modules).where(eq(modules.slug, "tasks"));
  if (!tasksModule) throw new Error("tasks module missing");
  [space] = await db
    .insert(spaces)
    .values({ moduleId: tasksModule.id, name: "CRM", slug: "crm", taskPrefix: "CRM", createdBy: ownerId })
    .returning();
  await db.insert(spaceTaskCounters).values({ spaceId: space.id, nextNumber: 1 });
  await db
    .insert(spaceMembers)
    .values({ spaceId: space.id, principalType: "user", userId: ownerId, role: "owner" });
  console.log("created CRM space");
  return space;
}

async function importList(spaceId: string, taskPrefix: string, spec: ListSpec) {
  const cuTasks = JSON.parse(fs.readFileSync(path.join(SCRATCH, `${spec.filePrefix}_tasks.json`), "utf8")) as CuTask[];
  const cuFields = (
    JSON.parse(fs.readFileSync(path.join(SCRATCH, `${spec.filePrefix}_fields.json`), "utf8")) as { fields: CuField[] }
  ).fields;
  cuTasks.sort((a, b) => Number(a.date_created) - Number(b.date_created));
  const cuFieldByName = new Map(cuFields.map((f) => [f.name.trim(), f]));

  // list + statuses
  let [list] = await db.select().from(lists).where(and(eq(lists.spaceId, spaceId), eq(lists.slug, spec.slug)));
  if (!list) {
    [list] = await db
      .insert(lists)
      .values({ spaceId, name: spec.name, slug: spec.slug, description: "Imported from ClickUp" })
      .returning();
  }
  const existingStatuses = await db.select().from(statuses).where(eq(statuses.listId, list.id));
  const statusByName = new Map(existingStatuses.map((s) => [s.name, s]));
  const statusIdByCu = new Map<string, string>();
  for (let i = 0; i < spec.statuses.length; i++) {
    const def = spec.statuses[i];
    let row = statusByName.get(def.name);
    if (!row) {
      [row] = await db
        .insert(statuses)
        .values({ listId: list.id, name: def.name, color: def.color, category: def.category, position: `a${i}` })
        .returning();
    }
    statusIdByCu.set(def.cu, row.id);
  }
  if (!list.defaultStatusId) {
    await db.update(lists).set({ defaultStatusId: statusIdByCu.get(spec.statuses[0].cu)! }).where(eq(lists.id, list.id));
  }

  // field definitions
  const existingDefs = await db.select().from(customFieldDefinitions).where(eq(customFieldDefinitions.listId, list.id));
  const defsByKey = new Map(existingDefs.map((d) => [d.key, d]));
  const runtimes: {
    defId: string;
    spec: FieldSpec;
    optionByCuId: Map<string, string>;
    optionByIdx: Map<number, string>;
  }[] = [];
  let pos = 0;
  for (const fspec of spec.fields) {
    const cu = cuFieldByName.get(fspec.cuName);
    if (!cu) {
      console.log(`  (field not in ClickUp, skipping: ${fspec.cuName})`);
      continue;
    }
    const cuOptions = cu.type_config?.options ?? [];
    const options =
      fspec.type === "dropdown" || fspec.type === "multi_select"
        ? cuOptions.map((o) => ({ id: o.id, label: o.name ?? o.label ?? "?", color: o.color ?? undefined }))
        : null;
    let def = defsByKey.get(fspec.key);
    if (!def) {
      [def] = await db
        .insert(customFieldDefinitions)
        .values({ listId: list.id, key: fspec.key, label: fspec.label, type: fspec.type, options, position: `a${pos}` })
        .returning();
    }
    runtimes.push({
      defId: def.id,
      spec: fspec,
      optionByCuId: new Map(cuOptions.map((o) => [o.id, o.id])),
      optionByIdx: new Map(cuOptions.map((o) => [Number(o.orderindex), o.id])),
    });
    pos++;
  }
  let urlDef = defsByKey.get("clickup_url");
  if (!urlDef) {
    [urlDef] = await db
      .insert(customFieldDefinitions)
      .values({ listId: list.id, key: "clickup_url", label: "ClickUp URL", type: "url", position: `a${pos}` })
      .returning();
  }

  // placeholder users for any unknown assignees/creators
  let usersByEmail = await loadUsersByEmail();
  const needed = new Map<string, string>();
  for (const t of cuTasks) {
    for (const a of [...t.assignees, ...(t.creator ? [t.creator] : [])]) {
      const e = normEmail(a.email);
      if (e && !usersByEmail.has(e) && !needed.has(e)) needed.set(e, a.username?.trim() || e.split("@")[0]);
    }
  }
  if (needed.size) {
    await db.insert(users).values(
      [...needed.entries()].map(([email, name]) => ({
        email,
        displayName: `${name} (ClickUp)`,
        isActive: false,
        platformRole: "member" as const,
      })),
    );
    console.log(`  created ${needed.size} placeholder users: ${[...needed.keys()].join(", ")}`);
    usersByEmail = await loadUsersByEmail();
  }

  // idempotency by ClickUp URL
  const existingRows = await db
    .select({ id: tasks.id, customFields: tasks.customFields })
    .from(tasks)
    .where(eq(tasks.listId, list.id));
  const importedUrls = new Set<string>();
  for (const r of existingRows) {
    const u = (r.customFields as Record<string, unknown>)[urlDef.id];
    if (typeof u === "string") importedUrls.add(u);
  }
  const toImport = cuTasks.filter((t) => !importedUrls.has(t.url));
  console.log(`  ${spec.name}: ${cuTasks.length} in ClickUp, ${importedUrls.size} imported, ${toImport.length} to insert`);
  if (toImport.length === 0) return;

  const [counter] = await db
    .update(spaceTaskCounters)
    .set({ nextNumber: sql`${spaceTaskCounters.nextNumber} + ${toImport.length}` })
    .where(eq(spaceTaskCounters.spaceId, spaceId))
    .returning({ next: spaceTaskCounters.nextNumber });
  let nextNum = counter.next - toImport.length;

  const CHUNK = 200;
  for (let i = 0; i < toImport.length; i += CHUNK) {
    const chunk = toImport.slice(i, i + CHUNK);
    const rows = chunk.map((t) => {
      const created = msToDate(t.date_created) ?? new Date();
      const statusId = statusIdByCu.get(t.status.status);
      if (!statusId) throw new Error(`unknown status ${t.status.status}`);
      const cf: Record<string, unknown> = { [urlDef.id]: t.url };
      const valueByName = new Map(t.custom_fields.map((f) => [f.name.trim(), f]));
      for (const rt of runtimes) {
        const v = valueByName.get(rt.spec.cuName)?.value;
        if (v === null || v === undefined || (typeof v === "string" && !v) || (Array.isArray(v) && !v.length)) continue;
        switch (rt.spec.type) {
          case "multi_select": {
            const ids = (Array.isArray(v) ? v : [v]).map((x) => rt.optionByCuId.get(String(x))).filter((x): x is string => !!x);
            if (ids.length) cf[rt.defId] = ids;
            break;
          }
          case "dropdown": {
            const id =
              typeof v === "number" ? rt.optionByIdx.get(v) : rt.optionByCuId.get(String(v)) ?? rt.optionByIdx.get(Number(v));
            if (id) cf[rt.defId] = id;
            break;
          }
          case "date": {
            const d = msToDateStr(v);
            if (d) cf[rt.defId] = d;
            break;
          }
          case "number": {
            const n = Number(v);
            if (Number.isFinite(n)) cf[rt.defId] = n;
            break;
          }
          case "checkbox":
            cf[rt.defId] = v === true || v === "true";
            break;
          case "url": {
            const s = String(v).slice(0, 2000);
            if (/^https?:\/\//.test(s)) cf[rt.defId] = s;
            break;
          }
          case "email": {
            const s = String(v).trim().slice(0, 320);
            if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) cf[rt.defId] = s;
            break;
          }
          default: {
            const s = String(v).slice(0, 500);
            if (s) cf[rt.defId] = s;
          }
        }
      }
      return {
        listId: list.id,
        number: `${taskPrefix}-${nextNum++}`,
        title: t.name.slice(0, 500),
        description: t.description?.trim() ? textToTiptap(t.description) : null,
        statusId,
        priority: null,
        customFields: cf,
        createdBy: usersByEmail.get(normEmail(t.creator?.email) ?? "") ?? null,
        completedAt: msToDate(t.date_closed),
        createdAt: created,
        updatedAt: msToDate(t.date_updated) ?? created,
      };
    });
    const inserted = await db.insert(tasks).values(rows).returning({ id: tasks.id });
    const assigneeRows: { taskId: string; userId: string; assignedAt: Date }[] = [];
    chunk.forEach((t, j) => {
      const seen = new Set<string>();
      for (const a of t.assignees) {
        const uid = usersByEmail.get(normEmail(a.email) ?? "");
        if (uid && !seen.has(uid)) {
          seen.add(uid);
          assigneeRows.push({ taskId: inserted[j].id, userId: uid, assignedAt: msToDate(t.date_created) ?? new Date() });
        }
      }
    });
    if (assigneeRows.length) await db.insert(taskAssignees).values(assigneeRows);
    console.log(`  inserted ${Math.min(i + CHUNK, toImport.length)}/${toImport.length}`);
  }
}

async function main() {
  const usersByEmail = await loadUsersByEmail();
  const kim = usersByEmail.get("kim@aitimgroup.com");
  if (!kim) throw new Error("kim@aitimgroup.com not found");
  const space = await ensureCrmSpace(kim);
  await importList(space.id, space.taskPrefix, COMPANIES);
  await importList(space.id, space.taskPrefix, LAWYERS);
  await getPool().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

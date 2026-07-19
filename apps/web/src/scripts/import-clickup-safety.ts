/**
 * One-shot importer for the ClickUp "🦺 Safety Compliance" list into the
 * intranet's Safety space. Reads pre-fetched ClickUp JSON from the scratchpad
 * directory (see cu_fetch_analyze.py / cu_fetch_details.py) — it never calls
 * the ClickUp API itself except to download attachment binaries in phase 2.
 *
 * Usage:
 *   tsx src/scripts/import-clickup-safety.ts tasks     # list/statuses/fields/users/tasks
 *   tsx src/scripts/import-clickup-safety.ts content   # comments + attachments (needs fetch done)
 *
 * Idempotent: re-running skips anything already imported (matched via the
 * "ClickUp URL" custom field for tasks and a state file for content).
 */
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  attachments,
  comments,
  customFieldDefinitions,
  db,
  getPool,
  lists,
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
const LIST_NAME = "Safety Compliance";
const LIST_SLUG = "safety-compliance";

/** ClickUp login emails that correspond to existing intranet accounts. */
const EMAIL_ALIASES: Record<string, string> = {
  "kgurinov@gurver.org": "kim@aitimgroup.com",
  "itops@aitimgroup.com": "itops_aitimgroup.com#EXT#@itopsaitimgroup.onmicrosoft.com",
};

const STATUS_DEFS = [
  { cu: "Open", color: "#008844", category: "open" },
  { cu: "in review", color: "#3db88b", category: "active" },
  { cu: "in progress", color: "#5f55ee", category: "active" },
  { cu: "verification", color: "#f8ae00", category: "active" },
  { cu: "delayed", color: "#aa8d80", category: "active" },
  { cu: "on hold", color: "#e16b16", category: "active" },
  { cu: "cancelled", color: "#e16b16", category: "cancelled" },
  { cu: "complete", color: "#008844", category: "done" },
] as const;

/** ClickUp field name -> our definition (key/label/type). */
const FIELD_MAP: { cuName: string; key: string; label: string; type: string }[] = [
  { cuName: "🧑‍💻 Type of the Task", key: "type_of_task", label: "Type of the Task", type: "multi_select" },
  { cuName: "Safety Claim Category", key: "safety_claim_category", label: "Safety Claim Category", type: "dropdown" },
  { cuName: "Project Name", key: "project_name", label: "Project Name", type: "text" },
  { cuName: "Project Status", key: "project_status", label: "Project Status", type: "dropdown" },
  { cuName: "Inspection", key: "inspection", label: "Inspection", type: "dropdown" },
  { cuName: "Type of Payment", key: "type_of_payment", label: "Type of Payment", type: "dropdown" },
  { cuName: "Result", key: "result", label: "Result", type: "dropdown" },
  { cuName: "🛒 Safety Level Package", key: "safety_level_package", label: "Safety Level Package", type: "dropdown" },
  { cuName: "🏛️ Court Date", key: "court_date", label: "Court Date", type: "date" },
];

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
  tags: { name: string }[];
  custom_fields: CuField[];
  url: string;
  parent?: string | null;
}

function slugifyId(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
}

function msToDateStr(ms: string | number | null | undefined): string | null {
  if (!ms) return null;
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n).toISOString().slice(0, 10);
}

function msToDate(ms: string | number | null | undefined): Date | null {
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

async function ensurePlaceholderUsers(cuTasks: CuTask[], commentAuthors: Map<string, string>) {
  const byEmail = await loadUsersByEmail();
  const needed = new Map<string, string>(); // email -> display name
  const consider = (email: string | null | undefined, username: string | null | undefined) => {
    const e = normEmail(email);
    if (!e || byEmail.has(e) || needed.has(e)) return;
    needed.set(e, username?.trim() || e.split("@")[0]);
  };
  for (const t of cuTasks) {
    for (const a of t.assignees) consider(a.email, a.username);
    if (t.creator) consider(t.creator.email, t.creator.username);
  }
  for (const [email, username] of commentAuthors) consider(email, username);

  if (needed.size > 0) {
    await db.insert(users).values(
      [...needed.entries()].map(([email, displayName]) => ({
        email,
        displayName: `${displayName} (ClickUp)`,
        isActive: false,
        platformRole: "member" as const,
      })),
    );
    console.log(`created ${needed.size} placeholder users: ${[...needed.keys()].join(", ")}`);
  }
  return loadUsersByEmail();
}

async function ensureListAndStatuses(spaceId: string) {
  let [list] = await db
    .select()
    .from(lists)
    .where(and(eq(lists.spaceId, spaceId), eq(lists.slug, LIST_SLUG)));
  if (!list) {
    [list] = await db
      .insert(lists)
      .values({ spaceId, name: LIST_NAME, slug: LIST_SLUG, description: "Imported from ClickUp" })
      .returning();
  }
  const existing = await db.select().from(statuses).where(eq(statuses.listId, list.id));
  const byName = new Map(existing.map((s) => [s.name, s]));
  const statusIdByCu = new Map<string, string>();
  for (let i = 0; i < STATUS_DEFS.length; i++) {
    const def = STATUS_DEFS[i];
    const name = def.cu === "Open" ? "Open" : def.cu.replace(/\b\w/g, (c) => c.toUpperCase());
    let row = byName.get(name);
    if (!row) {
      [row] = await db
        .insert(statuses)
        .values({ listId: list.id, name, color: def.color, category: def.category, position: `a${i}` })
        .returning();
    }
    statusIdByCu.set(def.cu.toLowerCase(), row.id);
  }
  if (!list.defaultStatusId) {
    await db
      .update(lists)
      .set({ defaultStatusId: statusIdByCu.get("open")! })
      .where(eq(lists.id, list.id));
  }
  return { list, statusIdByCu };
}

interface FieldRuntime {
  defId: string;
  cuName: string;
  type: string;
  optionByCuId: Map<string, string>;
  optionByIdx: Map<number, string>;
}

async function ensureFieldDefinitions(listId: string, cuTasks: CuTask[]) {
  const cuFields = (JSON.parse(fs.readFileSync(path.join(SCRATCH, "cu_fields.json"), "utf8")) as { fields: CuField[] })
    .fields;
  const cuByName = new Map(cuFields.map((f) => [f.name, f]));
  const existing = await db.select().from(customFieldDefinitions).where(eq(customFieldDefinitions.listId, listId));
  const existingByKey = new Map(existing.map((d) => [d.key, d]));

  const runtimes: FieldRuntime[] = [];
  let pos = 0;

  for (const fm of FIELD_MAP) {
    const cu = cuByName.get(fm.cuName);
    if (!cu) continue;
    const cuOptions = cu.type_config?.options ?? [];
    const options =
      fm.type === "dropdown" || fm.type === "multi_select"
        ? cuOptions.map((o) => ({ id: o.id, label: o.name ?? o.label ?? "?", color: o.color ?? undefined }))
        : null;
    let def = existingByKey.get(fm.key);
    if (!def) {
      [def] = await db
        .insert(customFieldDefinitions)
        .values({
          listId,
          key: fm.key,
          label: fm.label,
          type: fm.type as never,
          options,
          position: `a${pos}`,
        })
        .returning();
    }
    const optionByCuId = new Map(cuOptions.map((o) => [o.id, o.id]));
    const optionByIdx = new Map(cuOptions.map((o) => [Number(o.orderindex), o.id]));
    runtimes.push({ defId: def.id, cuName: fm.cuName, type: fm.type, optionByCuId, optionByIdx });
    pos++;
  }

  // Tags multi_select: options = union of tag names
  const tagNames = new Set<string>();
  for (const t of cuTasks) for (const tag of t.tags) tagNames.add(tag.name);
  if (tagNames.size > 0) {
    let def = existingByKey.get("tags");
    if (!def) {
      [def] = await db
        .insert(customFieldDefinitions)
        .values({
          listId,
          key: "tags",
          label: "Tags",
          type: "multi_select",
          options: [...tagNames].sort().map((n) => ({ id: slugifyId(n), label: n })),
          position: `a${pos++}`,
        })
        .returning();
    }
    const m = new Map([...tagNames].map((n) => [n, slugifyId(n)]));
    runtimes.push({
      defId: def.id,
      cuName: "__tags__",
      type: "multi_select",
      optionByCuId: m,
      optionByIdx: new Map(),
    });
  }

  // ClickUp URL
  let urlDef = existingByKey.get("clickup_url");
  if (!urlDef) {
    [urlDef] = await db
      .insert(customFieldDefinitions)
      .values({ listId, key: "clickup_url", label: "ClickUp URL", type: "url", position: `a${pos++}` })
      .returning();
  }
  runtimes.push({ defId: urlDef.id, cuName: "__url__", type: "url", optionByCuId: new Map(), optionByIdx: new Map() });

  return runtimes;
}

function buildCustomFields(t: CuTask, runtimes: FieldRuntime[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const cuByName = new Map(t.custom_fields.map((f) => [f.name, f]));
  for (const rt of runtimes) {
    if (rt.cuName === "__url__") {
      out[rt.defId] = t.url;
      continue;
    }
    if (rt.cuName === "__tags__") {
      const ids = t.tags.map((tag) => rt.optionByCuId.get(tag.name)).filter((x): x is string => !!x);
      if (ids.length) out[rt.defId] = ids;
      continue;
    }
    const cu = cuByName.get(rt.cuName);
    const v = cu?.value;
    if (v === null || v === undefined || (typeof v === "string" && v === "") || (Array.isArray(v) && v.length === 0))
      continue;
    switch (rt.type) {
      case "multi_select": {
        const ids = (Array.isArray(v) ? v : [v])
          .map((x) => rt.optionByCuId.get(String(x)))
          .filter((x): x is string => !!x);
        if (ids.length) out[rt.defId] = ids;
        break;
      }
      case "dropdown": {
        const id =
          typeof v === "number"
            ? rt.optionByIdx.get(v)
            : rt.optionByCuId.get(String(v)) ?? rt.optionByIdx.get(Number(v));
        if (id) out[rt.defId] = id;
        break;
      }
      case "date": {
        const d = msToDateStr(v as string);
        if (d) out[rt.defId] = d;
        break;
      }
      default: {
        const s = String(v).slice(0, 500);
        if (s) out[rt.defId] = s;
      }
    }
  }
  return out;
}

const PRIORITY_MAP: Record<string, "urgent" | "high" | "normal" | "low"> = {
  urgent: "urgent",
  high: "high",
  normal: "normal",
  low: "low",
};

async function importTasks() {
  const cuTasks = JSON.parse(fs.readFileSync(path.join(SCRATCH, "cu_all_tasks.json"), "utf8")) as CuTask[];
  cuTasks.sort((a, b) => Number(a.date_created) - Number(b.date_created));

  const [space] = await db.select().from(spaces).where(eq(spaces.slug, "safety"));
  if (!space) throw new Error("Safety space not found");

  const { list, statusIdByCu } = await ensureListAndStatuses(space.id);
  const runtimes = await ensureFieldDefinitions(list.id, cuTasks);

  // Comment authors need placeholder users too (phase 2 uses same table).
  const commentAuthors = new Map<string, string>();
  const commentsDir = path.join(SCRATCH, "comments");
  if (fs.existsSync(commentsDir)) {
    for (const f of fs.readdirSync(commentsDir)) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(commentsDir, f), "utf8"));
        for (const c of data.comments ?? []) {
          const e = c.user?.email;
          if (e) commentAuthors.set(e.toLowerCase(), c.user?.username ?? e);
        }
      } catch {
        // partial file while fetcher is running — phase 2 re-checks
      }
    }
  }
  const usersByEmail = await ensurePlaceholderUsers(cuTasks, commentAuthors);

  // Idempotency: skip ClickUp tasks whose URL is already present.
  const urlDefId = runtimes.find((r) => r.cuName === "__url__")!.defId;
  const existingRows = await db
    .select({ id: tasks.id, customFields: tasks.customFields })
    .from(tasks)
    .where(eq(tasks.listId, list.id));
  const importedUrls = new Map<string, string>();
  for (const r of existingRows) {
    const u = (r.customFields as Record<string, unknown>)[urlDefId];
    if (typeof u === "string") importedUrls.set(u, r.id);
  }

  const toImport = cuTasks.filter((t) => !importedUrls.has(t.url));
  console.log(`tasks: ${cuTasks.length} in ClickUp, ${importedUrls.size} already imported, ${toImport.length} to insert`);
  if (toImport.length === 0) return saveIdMap(cuTasks, importedUrls);

  // Allocate a contiguous number block from the space counter.
  const [counter] = await db
    .update(spaceTaskCounters)
    .set({ nextNumber: sql`${spaceTaskCounters.nextNumber} + ${toImport.length}` })
    .where(eq(spaceTaskCounters.spaceId, space.id))
    .returning({ next: spaceTaskCounters.nextNumber });
  let nextNum = counter.next - toImport.length;

  const CHUNK = 200;
  for (let i = 0; i < toImport.length; i += CHUNK) {
    const chunk = toImport.slice(i, i + CHUNK);
    const rows = chunk.map((t) => {
      const created = msToDate(t.date_created) ?? new Date();
      const statusId = statusIdByCu.get(t.status.status.toLowerCase());
      if (!statusId) throw new Error(`unknown status: ${t.status.status}`);
      return {
        listId: list.id,
        number: `${space.taskPrefix}-${nextNum++}`,
        title: t.name.slice(0, 500),
        description: t.description?.trim() ? textToTiptap(t.description) : null,
        statusId,
        priority: t.priority ? PRIORITY_MAP[t.priority.priority] ?? null : null,
        dueDate: msToDateStr(t.due_date),
        startDate: msToDateStr(t.start_date),
        customFields: buildCustomFields(t, runtimes),
        createdBy: usersByEmail.get(normEmail(t.creator?.email) ?? "") ?? null,
        completedAt:
          msToDate(t.date_closed) ??
          (t.status.status.toLowerCase() === "complete" ? msToDate(t.date_updated) : null),
        createdAt: created,
        updatedAt: msToDate(t.date_updated) ?? created,
      };
    });
    const inserted = await db.insert(tasks).values(rows).returning({ id: tasks.id, number: tasks.number });

    const assigneeRows: { taskId: string; userId: string; assignedAt: Date }[] = [];
    chunk.forEach((t, j) => {
      importedUrls.set(t.url, inserted[j].id);
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
    console.log(`inserted ${Math.min(i + CHUNK, toImport.length)}/${toImport.length}`);
  }
  await saveIdMap(cuTasks, importedUrls);
}

async function saveIdMap(cuTasks: CuTask[], importedUrls: Map<string, string>) {
  const map: Record<string, string> = {};
  for (const t of cuTasks) {
    const id = importedUrls.get(t.url);
    if (id) map[t.id] = id;
  }
  fs.writeFileSync(path.join(SCRATCH, "cu_id_map.json"), JSON.stringify(map));
  console.log(`id map saved (${Object.keys(map).length} entries)`);
}

// ---------------------------------------------------------------- relationships

/** ClickUp list_relationship fields -> our multi_select fields (linked record names as options). */
const RELATIONSHIP_MAP = [
  { cuName: "🦺 Safety Compliance", key: "company", label: "Company" },
  { cuName: "⚖️ Lawyer", key: "lawyer", label: "Lawyer" },
] as const;

async function importRelationships() {
  const cuTasks = JSON.parse(fs.readFileSync(path.join(SCRATCH, "cu_all_tasks.json"), "utf8")) as CuTask[];
  const idMap = JSON.parse(fs.readFileSync(path.join(SCRATCH, "cu_id_map.json"), "utf8")) as Record<string, string>;
  const [list] = await db
    .select()
    .from(lists)
    .where(and(eq(lists.slug, LIST_SLUG), eq(lists.spaceId, sql`(select id from spaces where slug = 'safety')`)));
  if (!list) throw new Error("Safety Compliance list not found");
  const existing = await db.select().from(customFieldDefinitions).where(eq(customFieldDefinitions.listId, list.id));
  const existingByKey = new Map(existing.map((d) => [d.key, d]));
  let pos = existing.length;

  for (const rel of RELATIONSHIP_MAP) {
    // Collect linked records: id -> name (from the values embedded in task payloads).
    const records = new Map<string, string>();
    const perTask = new Map<string, string[]>(); // our task id -> linked record ids
    for (const t of cuTasks) {
      const ourId = idMap[t.id];
      if (!ourId) continue;
      const f = t.custom_fields.find((x) => x.name === rel.cuName);
      const v = f?.value;
      if (!Array.isArray(v) || v.length === 0) continue;
      const ids: string[] = [];
      for (const item of v as { id?: string; name?: string; deleted?: boolean }[]) {
        if (!item?.id) continue;
        records.set(item.id, item.name ?? item.id);
        ids.push(item.id);
      }
      if (ids.length) perTask.set(ourId, ids);
    }
    if (records.size === 0) continue;

    let def = existingByKey.get(rel.key);
    const options = [...records.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, label]) => ({ id, label }));
    if (!def) {
      [def] = await db
        .insert(customFieldDefinitions)
        .values({ listId: list.id, key: rel.key, label: rel.label, type: "multi_select", options, position: `a${pos++}` })
        .returning();
    } else {
      // merge any new options into the existing definition
      const have = new Set(((def.options as { id: string }[] | null) ?? []).map((o) => o.id));
      const merged = [...(((def.options as { id: string; label: string }[] | null) ?? [])), ...options.filter((o) => !have.has(o.id))];
      await db.update(customFieldDefinitions).set({ options: merged }).where(eq(customFieldDefinitions.id, def.id));
    }

    // Batched jsonb merge: UPDATE ... FROM (VALUES ...) — one statement per chunk.
    const entries = [...perTask.entries()];
    const CHUNK = 200;
    const pool = getPool();
    for (let i = 0; i < entries.length; i += CHUNK) {
      const chunk = entries.slice(i, i + CHUNK);
      const params: string[] = [];
      const values: string[] = [];
      chunk.forEach(([taskId, ids], j) => {
        params.push(`($${j * 2 + 1}::uuid, $${j * 2 + 2}::jsonb)`);
        values.push(taskId, JSON.stringify({ [def!.id]: ids }));
      });
      await pool.query(
        `UPDATE tasks SET custom_fields = custom_fields || v.patch FROM (VALUES ${params.join(",")}) AS v(id, patch) WHERE tasks.id = v.id`,
        values,
      );
    }
    console.log(`${rel.label}: ${records.size} options, ${entries.length} tasks backfilled`);
  }
}

// ---------------------------------------------------------------- phase 2

const MAX_ATTACHMENT = 100 * 1024 * 1024;
const ATTACHMENT_WORKERS = 4;

async function importContent() {
  const { BUCKETS, putObject } = await import("../lib/storage");
  const idMap = JSON.parse(fs.readFileSync(path.join(SCRATCH, "cu_id_map.json"), "utf8")) as Record<string, string>;
  const usersByEmail = await loadUsersByEmail();
  const statePath = path.join(SCRATCH, "content_state.json");
  const state: { comments: Record<string, true>; attachments: Record<string, true> } = fs.existsSync(statePath)
    ? JSON.parse(fs.readFileSync(statePath, "utf8"))
    : { comments: {}, attachments: {} };
  const saveState = () => fs.writeFileSync(statePath, JSON.stringify(state));

  let cDone = 0;
  let aDone = 0;
  let aSkipped = 0;
  let errors = 0;
  const cuIds = Object.keys(idMap);

  // ── comments: batched insert per task ──────────────────────────────────────
  for (let i = 0; i < cuIds.length; i++) {
    const cuId = cuIds[i];
    const taskId = idMap[cuId];
    const cPath = path.join(SCRATCH, "comments", `${cuId}.json`);
    if (!fs.existsSync(cPath)) continue;
    let data: { comments?: { id: string; comment_text?: string; date: string; user?: { email?: string } }[] };
    try {
      data = JSON.parse(fs.readFileSync(cPath, "utf8"));
    } catch {
      continue;
    }
    // ClickUp returns newest first; insert oldest first
    const list = [...(data.comments ?? [])].reverse();
    const rows: (typeof comments.$inferInsert)[] = [];
    const pendingIds: string[] = [];
    for (const c of list) {
      if (state.comments[c.id]) continue;
      const text = (c.comment_text ?? "").trim();
      if (!text) {
        state.comments[c.id] = true;
        continue;
      }
      const authorId =
        usersByEmail.get(normEmail(c.user?.email) ?? "") ?? usersByEmail.get("kim@aitimgroup.com")!;
      const created = msToDate(c.date) ?? new Date();
      rows.push({
        taskId,
        authorId,
        body: textToTiptap(text.slice(0, 20_000)),
        createdAt: created,
        updatedAt: created,
      });
      pendingIds.push(c.id);
    }
    if (rows.length) {
      await db.insert(comments).values(rows);
      for (const id of pendingIds) state.comments[id] = true;
      cDone += rows.length;
    }
    if (i % 500 === 0) {
      saveState();
      console.log(`comments ${i}/${cuIds.length}: +${cDone}`, new Date().toISOString());
    }
  }
  saveState();
  console.log(`comments done: +${cDone}`);

  // ── attachments: small worker pool over tasks ──────────────────────────────
  interface CuAttachment {
    id: string;
    title?: string;
    url?: string;
    size?: number;
    mimetype?: string;
    date?: string;
    deleted?: boolean;
  }
  let cursor = 0;
  let processed = 0;

  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= cuIds.length) return;
      const cuId = cuIds[i];
      const taskId = idMap[cuId];
      const dPath = path.join(SCRATCH, "details", `${cuId}.json`);
      if (fs.existsSync(dPath)) {
        let detail: { attachments?: CuAttachment[] };
        try {
          detail = JSON.parse(fs.readFileSync(dPath, "utf8"));
        } catch {
          detail = {};
        }
        for (const a of detail.attachments ?? []) {
          if (state.attachments[a.id] || a.deleted) continue;
          if (!a.url || (a.size ?? 0) > MAX_ATTACHMENT) {
            aSkipped++;
            state.attachments[a.id] = true;
            continue;
          }
          try {
            const buf = execFileSync("curl", ["-sfL", "--max-time", "180", a.url], {
              maxBuffer: MAX_ATTACHMENT + 1024,
            });
            const safeName = (a.title ?? "file").replace(/[^\w.\- ]+/g, "_").slice(0, 200);
            const objectKey = `${taskId}/${randomUUID()}-${safeName}`;
            const mime = a.mimetype || "application/octet-stream";
            await putObject(BUCKETS.attachments, objectKey, buf, mime);
            const created = msToDate(a.date) ?? new Date();
            await db.insert(attachments).values({
              taskId,
              objectKey,
              fileName: safeName,
              mimeType: mime,
              sizeBytes: buf.length,
              checksumSha256: createHash("sha256").update(buf).digest("hex"),
              createdAt: created,
              updatedAt: created,
            });
            state.attachments[a.id] = true;
            aDone++;
          } catch (e) {
            errors++;
            console.log(`attachment failed (task ${cuId}, ${a.title}): ${(e as Error).message.slice(0, 120)}`);
          }
        }
      }
      processed++;
      if (processed % 200 === 0) {
        saveState();
        console.log(`attachments ${processed}/${cuIds.length} tasks: +${aDone} (skipped ${aSkipped}, errors ${errors})`, new Date().toISOString());
      }
    }
  }
  await Promise.all(Array.from({ length: ATTACHMENT_WORKERS }, () => worker()));
  saveState();
  console.log(`DONE: comments +${cDone}, attachments +${aDone}, skipped ${aSkipped}, errors ${errors}`);
}

async function main() {
  const phase = process.argv[2];
  if (phase === "tasks") await importTasks();
  else if (phase === "relationships") await importRelationships();
  else if (phase === "content") await importContent();
  else throw new Error("usage: import-clickup-safety.ts <tasks|relationships|content>");
  await getPool().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

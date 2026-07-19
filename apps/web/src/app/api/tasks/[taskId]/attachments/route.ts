import { createHash, randomUUID } from "node:crypto";
import { attachments, db, lists, spaces, tasks } from "@aitim/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getListRole } from "@/lib/rbac";
import { BUCKETS, putObject } from "@/lib/storage";
import { logActivity } from "@/modules/tasks/lib/activity";

const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

export async function POST(req: Request, ctx: { params: Promise<{ taskId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { taskId } = await ctx.params;
  const [row] = await db
    .select({ task: tasks, list: lists, space: spaces })
    .from(tasks)
    .innerJoin(lists, eq(tasks.listId, lists.id))
    .innerJoin(spaces, eq(lists.spaceId, spaces.id))
    .where(eq(tasks.id, taskId));
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const role = await getListRole(session.user.id, row.list.id, session.user.platformRole);
  if (!role || role === "guest") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
  if (file.size === 0 || file.size > MAX_SIZE) {
    return NextResponse.json({ error: "file too large (max 25 MB)" }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 200);
  const objectKey = `${taskId}/${randomUUID()}-${safeName}`;

  await putObject(BUCKETS.attachments, objectKey, buffer, file.type || "application/octet-stream");

  await db.transaction(async (tx) => {
    await tx.insert(attachments).values({
      taskId,
      uploaderId: session.user.id,
      objectKey,
      fileName: safeName,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      checksumSha256: checksum,
    });
    await logActivity(tx, {
      spaceId: row.space.id,
      taskId,
      actorId: session.user.id,
      verb: "attachment.added",
      payload: { fileName: safeName, sizeBytes: file.size },
    });
  });

  return NextResponse.json({ ok: true });
}

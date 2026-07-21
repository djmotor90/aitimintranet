import { createHash, randomUUID } from "node:crypto";
import { attachments, db, lists, spaces, tasks } from "@aitim/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getListRole } from "@/lib/rbac";
import { BUCKETS, putObject } from "@/lib/storage";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_LABEL,
} from "@/lib/upload-limits";
import { logActivity } from "@/modules/tasks/lib/activity";

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
  // Guests may comment — allow them to paste/upload images into comments too.
  if (!role) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no file" }, { status: 400 });
  if (file.size === 0 || file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json(
      { error: `file too large (max ${MAX_ATTACHMENT_LABEL})` },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const rawName = file.name?.trim() || `paste-${Date.now()}.png`;
  const safeName = rawName.replace(/[^\w.\- ]+/g, "_").slice(0, 200);
  const objectKey = `${taskId}/${randomUUID()}-${safeName}`;
  const mimeType = file.type || "application/octet-stream";

  await putObject(BUCKETS.attachments, objectKey, buffer, mimeType);

  const [created] = await db.transaction(async (tx) => {
    const [rowInsert] = await tx
      .insert(attachments)
      .values({
        taskId,
        uploaderId: session.user.id,
        objectKey,
        fileName: safeName,
        mimeType,
        sizeBytes: file.size,
        checksumSha256: checksum,
      })
      .returning({
        id: attachments.id,
        fileName: attachments.fileName,
        mimeType: attachments.mimeType,
        sizeBytes: attachments.sizeBytes,
      });
    await logActivity(tx, {
      spaceId: row.space.id,
      taskId,
      actorId: session.user.id,
      verb: "attachment.added",
      payload: { fileName: safeName, sizeBytes: file.size },
    });
    return [rowInsert];
  });

  if (!created) {
    return NextResponse.json({ error: "upload failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    id: created.id,
    fileName: created.fileName,
    mimeType: created.mimeType,
    sizeBytes: created.sizeBytes,
    /** Authenticated image/file URL for embedding in the rich-text editor. */
    url: `/api/attachments/${created.id}`,
  });
}

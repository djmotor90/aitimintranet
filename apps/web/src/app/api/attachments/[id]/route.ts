import { attachments, db, lists, spaces, tasks } from "@aitim/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getListRole } from "@/lib/rbac";
import { BUCKETS, getObjectStream } from "@/lib/storage";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse(null, { status: 401 });

  const { id } = await ctx.params;
  const [row] = await db
    .select({ attachment: attachments, list: lists, space: spaces })
    .from(attachments)
    .innerJoin(tasks, eq(attachments.taskId, tasks.id))
    .innerJoin(lists, eq(tasks.listId, lists.id))
    .innerJoin(spaces, eq(lists.spaceId, spaces.id))
    .where(eq(attachments.id, id));
  if (!row) return new NextResponse(null, { status: 404 });

  const role = await getListRole(session.user.id, row.list.id, session.user.platformRole);
  if (!role) return new NextResponse(null, { status: 403 });

  try {
    const { body, contentType, length } = await getObjectStream(
      BUCKETS.attachments,
      row.attachment.objectKey,
    );
    const mime = contentType ?? row.attachment.mimeType;
    const isImage = mime.startsWith("image/");
    // Inline so pasted screenshots render in the editor / comments.
    const disposition = isImage
      ? `inline; filename="${encodeURIComponent(row.attachment.fileName)}"`
      : `attachment; filename="${encodeURIComponent(row.attachment.fileName)}"`;
    return new NextResponse(body as unknown as ReadableStream, {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(length ?? row.attachment.sizeBytes),
        "Content-Disposition": disposition,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

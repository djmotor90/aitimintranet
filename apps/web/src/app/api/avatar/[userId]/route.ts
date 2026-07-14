import { db, users } from "@aitim/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { BUCKETS, getObjectStream } from "@/lib/storage";

export async function GET(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  const session = await auth();
  if (!session?.user) return new NextResponse(null, { status: 401 });

  const { userId } = await ctx.params;
  const [user] = await db
    .select({ photoKey: users.photoKey })
    .from(users)
    .where(eq(users.id, userId));
  if (!user?.photoKey) return new NextResponse(null, { status: 404 });

  try {
    const { body, contentType } = await getObjectStream(BUCKETS.photos, user.photoKey);
    return new NextResponse(body as unknown as ReadableStream, {
      headers: {
        "Content-Type": contentType ?? "image/jpeg",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

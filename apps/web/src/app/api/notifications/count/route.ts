import { db, notifications } from "@aitim/db";
import { and, count, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ count: 0 }, { status: 401 });
  const [{ value }] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.recipientId, session.user.id), isNull(notifications.readAt)));
  return NextResponse.json({ count: value });
}

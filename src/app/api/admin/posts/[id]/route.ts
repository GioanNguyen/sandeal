import { redirectTo, refererPath } from "@/lib/redirect";
import { NextResponse } from "next/server";
import { eq, not } from "drizzle-orm";
import { posts } from "@/db/schema";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

/** Admin ẩn/hiện bài chia sẻ */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.email)) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  await db.update(posts).set({ hidden: not(posts.hidden) }).where(eq(posts.id, Number((await params).id)));
  return redirectTo(refererPath(req, "/cong-dong"), 303);
}

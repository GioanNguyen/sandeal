import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { productRequests } from "@/db/schema";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { db, ensureMigrated } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Quản trị › Nhu cầu khách: xoá 1 link khách dán chưa có món (link rác, link sai, món không muốn theo dõi).
 * Người đang chờ báo của link đó cũng bị xoá theo (request_watchers xoá dây chuyền), sẽ không nhận được email báo.
 * Khách dán lại link thì link được tạo lại như mới.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.email)) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { id?: unknown };
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Thiếu mã link" }, { status: 400 });
  await ensureMigrated();
  // Chỉ xoá link chưa có món (link đã thành món thì giữ lại để biết món đến từ khách hỏi)
  const gone = await db.delete(productRequests).where(and(eq(productRequests.id, id), isNull(productRequests.productId))).returning({ id: productRequests.id });
  return gone.length ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Không tìm thấy link (có thể đã có món hoặc đã xoá)" }, { status: 404 });
}

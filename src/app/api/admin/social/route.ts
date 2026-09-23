import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { products, socialPosts } from "@/db/schema";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { channels, postDeal } from "@/worker/social";

const MANUAL = ["zalo", "tiktok", "facebook-group"];

/** Admin: đăng ngay lên kênh đã kết nối, hoặc đánh dấu đã đăng thủ công (Zalo, TikTok, nhóm Facebook) */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.email)) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const channel = String(body?.channel ?? "");
  const [p] = await db.select().from(products).where(eq(products.id, Number(body?.productId))).limit(1);
  if (!p) return NextResponse.json({ error: "Không tìm thấy sản phẩm" }, { status: 404 });
  if (MANUAL.includes(channel)) {
    await db.insert(socialPosts).values({ channel, productId: p.id });
    return NextResponse.json({ ok: true });
  }
  if (!(channels() as string[]).includes(channel)) return NextResponse.json({ error: "Kênh chưa được cấu hình" }, { status: 400 });
  const ok = await postDeal(channel as "telegram" | "facebook", p);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Đăng thất bại, xem lịch sử bên dưới" }, { status: 502 });
}

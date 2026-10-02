import { eq } from "drizzle-orm";
import { products } from "@/db/schema";
import { db, ensureMigrated } from "@/lib/db";
import { reelFrame } from "@/lib/og";
import { reelPlan } from "@/worker/reels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Khung hình Reel 1080×1920: /reel/frame?id=123&s=1|2|3 (worker tải về để ghép video; xem thử được trên trình duyệt) */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const id = Number(u.searchParams.get("id"));
  const s = Number(u.searchParams.get("s"));
  if (!Number.isInteger(id) || id <= 0 || ![1, 2, 3].includes(s)) return new Response("Thiếu id hoặc s", { status: 400 });
  await ensureMigrated();
  const [p] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!p) return new Response("Không tìm thấy", { status: 404 });
  const plan = await reelPlan(p);
  const res = await reelFrame(s as 1 | 2 | 3, plan.frame);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex");
  return res;
}

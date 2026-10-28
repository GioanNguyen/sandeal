import { redirectTo } from "@/lib/redirect";
import { eq } from "drizzle-orm";
import { products } from "@/db/schema";
import { db, ensureMigrated } from "@/lib/db";
import { trackClickAndRedirect } from "@/lib/clicktrack";

/** Ghi nhận lượt bấm "Mua" rồi chuyển sang link affiliate (không tính quản trị viên, bot, tải trước – xem clicktrack.ts) */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureMigrated();
  const id = Number((await params).id);
  const [p] = Number.isInteger(id)
    ? await db.select({ id: products.id, url: products.affiliateUrl, platform: products.platform }).from(products).where(eq(products.id, id)).limit(1)
    : [];
  if (!p) return redirectTo("/");
  return trackClickAndRedirect(req, p.url, { productId: p.id, platform: p.platform });
}

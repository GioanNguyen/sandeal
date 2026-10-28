import { redirectTo } from "@/lib/redirect";
import { eq } from "drizzle-orm";
import { vouchers } from "@/db/schema";
import { db, ensureMigrated } from "@/lib/db";
import { trackClickAndRedirect } from "@/lib/clicktrack";

/** Ghi nhận lượt bấm "Lấy mã" rồi chuyển sang link affiliate của mã giảm giá (không tính quản trị viên, bot – xem clicktrack.ts) */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureMigrated();
  const id = Number((await params).id);
  const [v] = Number.isInteger(id)
    ? await db.select({ id: vouchers.id, url: vouchers.affiliateUrl, platform: vouchers.platform }).from(vouchers).where(eq(vouchers.id, id)).limit(1)
    : [];
  if (!v) return redirectTo("/vouchers");
  return trackClickAndRedirect(req, v.url, { voucherId: v.id, platform: v.platform });
}

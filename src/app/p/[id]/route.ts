import { eq } from "drizzle-orm";
import { products } from "@/db/schema";
import { db, ensureMigrated } from "@/lib/db";
import { redirectTo } from "@/lib/redirect";
import { productPath } from "@/lib/slug";

/**
 * Link ngắn cho bình luận Facebook: /p/4004 -> /product/ten-san-pham-4004?utm_source=facebook…
 * Không có tham số thì tự gắn nguồn Facebook để trang Thống kê vẫn đo được; có ?utm_… thì giữ nguyên.
 * Dùng 302 (không cache vĩnh viễn) vì đường dẫn có tên có thể đổi khi tên sản phẩm đổi.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return redirectTo("/", 302);
  await ensureMigrated();
  const [p] = await db.select({ id: products.id, name: products.name }).from(products).where(eq(products.id, id)).limit(1);
  if (!p) return redirectTo("/", 302);
  const search = new URL(req.url).search;
  return redirectTo(`${productPath(p)}${search || "?utm_source=facebook&utm_medium=social&utm_content=comment"}`, 302);
}

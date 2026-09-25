import { redirectTo } from "@/lib/redirect";
import { eq } from "drizzle-orm";
import { products } from "@/db/schema";
import { db, ensureMigrated } from "@/lib/db";
import { productPath } from "@/lib/slug";

/** /product/12 (đường dẫn cũ) -> 301 sang /product/ten-san-pham-12 (middleware chuyển yêu cầu tới đây) */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const url = new URL(req.url);
  if (!Number.isInteger(id) || id <= 0) return redirectTo("/", 302);
  await ensureMigrated();
  const [p] = await db.select({ id: products.id, name: products.name }).from(products).where(eq(products.id, id)).limit(1);
  const target = (p ? productPath(p) : `/product/${id}-khong-ton-tai`) + url.search;
  return redirectTo(target, p ? 301 : 302);
}

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { products } from "@/db/schema";
import { db, ensureMigrated } from "@/lib/db";
import { productPath } from "@/lib/slug";

/** /product/12 (đường dẫn cũ) -> 301 sang /product/ten-san-pham-12 (middleware chuyển yêu cầu tới đây) */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const url = new URL(req.url);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.redirect(new URL("/", url), 302);
  await ensureMigrated();
  const [p] = await db.select({ id: products.id, name: products.name }).from(products).where(eq(products.id, id)).limit(1);
  const target = new URL(p ? productPath(p) : `/product/${id}-khong-ton-tai`, url);
  target.search = url.search;
  return NextResponse.redirect(target, p ? 301 : 302);
}

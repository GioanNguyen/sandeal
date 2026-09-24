import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { products } from "@/db/schema";
import { db, ensureMigrated } from "@/lib/db";

/** Giá hiện tại của nhiều sản phẩm (nhẹ, dùng để báo "món đã lưu vừa giảm giá") */
export async function GET(req: Request) {
  const ids = [...new Set((new URL(req.url).searchParams.get("ids") ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 100);
  if (!ids.length) return NextResponse.json({ prices: {} });
  await ensureMigrated();
  const rows = await db.select({ id: products.id, price: products.price }).from(products).where(inArray(products.id, ids));
  return NextResponse.json({ prices: Object.fromEntries(rows.map((r) => [r.id, r.price])) }, { headers: { "Cache-Control": "private, max-age=60" } });
}

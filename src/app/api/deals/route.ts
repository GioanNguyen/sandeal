import { NextResponse } from "next/server";
import { filterFromParams } from "@/lib/dealParams";
import { listDeals } from "@/lib/queries";

/** Tải thêm deal (cuộn vô hạn, "Dành cho bạn") */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const f = filterFromParams((k) => sp.get(k));
  const pageSize = Math.min(48, Math.max(1, Number(sp.get("size")) || 24));
  const { items, total } = await listDeals({ ...f, pageSize });
  return NextResponse.json({ items, total, hasMore: (f.page ?? 1) * pageSize < total });
}

import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { recheckProduct } from "@/lib/lookup";
import { BULK_MAX, ISSUES, idsMatching, setCategoryMany, setHiddenMany, type HealthFilter, type ImageFilter, type Issue } from "@/lib/producthealth";
import { runAutoCategory } from "@/worker/autocategory";
import { runFillImages } from "@/worker/fillimages";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ISSUE_KEYS = new Set<string>(["all", "available", ...ISSUES.map((i) => i.key)]);
const RECHECK_MAX = 30;

/** Bộ lọc gửi lên từ trang (chỉ nhận giá trị hợp lệ) */
function cleanFilter(f: Record<string, unknown> | undefined): HealthFilter {
  const s = (v: unknown, n = 300) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : undefined);
  const loc = s(f?.loc, 40);
  return {
    issue: loc === "con-ban" ? "available" : loc && ISSUE_KEYS.has(loc) ? (loc as Issue) : undefined,
    platform: s(f?.san, 20),
    q: s(f?.q),
    category: s(f?.dm, 120),
    image: (["co", "chua", "loi"] as const).includes(f?.anh as ImageFilter) ? (f?.anh as ImageFilter) : undefined,
  };
}

/**
 * Quản trị › Sản phẩm – thao tác hàng loạt:
 * - action "category" | "hide" | "unhide" | "recheck" cho các món đã chọn (ids) hoặc tất cả món khớp bộ lọc (filter)
 * - action "autocat" (tự xếp danh mục ngay), "images" (lấy ảnh ngay)
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.email)) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; ids?: unknown; filter?: Record<string, unknown>; category?: unknown; reason?: unknown };

  if (body.action === "autocat") {
    const r = await runAutoCategory();
    return NextResponse.json({ ok: true, ...r });
  }
  if (body.action === "images") {
    const r = await runFillImages({ limit: 50 });
    return NextResponse.json({ ok: !r.skipped, ...r, ...(r.skipped ? { error: r.skipped } : {}) });
  }

  const ids = body.filter
    ? await idsMatching(cleanFilter(body.filter))
    : (Array.isArray(body.ids) ? body.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, BULK_MAX);
  if (!ids.length) return NextResponse.json({ error: "Chưa chọn món nào" }, { status: 400 });

  switch (body.action) {
    case "category": {
      const c = typeof body.category === "string" ? body.category.trim() : "";
      if (!c) return NextResponse.json({ error: "Chưa chọn danh mục" }, { status: 400 });
      return NextResponse.json({ ok: true, updated: await setCategoryMany(ids, c) });
    }
    case "hide":
    case "unhide":
      return NextResponse.json({ ok: true, updated: await setHiddenMany(ids, body.action === "hide", typeof body.reason === "string" ? body.reason : null) });
    case "recheck": {
      if (ids.length > RECHECK_MAX) return NextResponse.json({ error: `Kiểm tra lại tối đa ${RECHECK_MAX} món mỗi lần (tra cứu trực tiếp trên sàn)` }, { status: 400 });
      let found = 0;
      for (const id of ids) if ((await recheckProduct(id)).found) found++;
      return NextResponse.json({ ok: true, updated: found, checked: ids.length });
    }
  }
  return NextResponse.json({ error: "Thao tác không hợp lệ" }, { status: 400 });
}

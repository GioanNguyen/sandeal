import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { attributeLines, importConversionCsv } from "@/lib/revenue";

export const maxDuration = 300;

/**
 * Quản trị › Doanh thu:
 *  - multipart "file": nhập tệp CSV báo cáo hoa hồng (Conversion report) tải ở trang Shopee Affiliate
 *  - JSON {action:"attribute"}: ghép lại toàn bộ đơn 90 ngày với món và lượt bấm
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.email)) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as { action?: string };
    if (body.action !== "attribute") return NextResponse.json({ error: "Thao tác không hợp lệ" }, { status: 400 });
    return NextResponse.json({ ok: true, ...(await attributeLines({ recheckDays: 90 })) });
  }
  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("file") ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return NextResponse.json({ error: "Chưa chọn tệp CSV" }, { status: 400 });
  if (files.some((f) => f.size > 20_000_000)) return NextResponse.json({ error: "Tệp quá lớn (tối đa 20 MB)" }, { status: 400 });
  const total = { orders: 0, lines: 0, matched: 0, skippedCount: 0, skipped: [] as { file: string; line: number; reason: string }[], columns: {} as Record<string, string>, commissionColumn: null as string | null };
  for (const f of files) {
    const r = await importConversionCsv(await f.text());
    total.orders += r.orders;
    total.lines += r.lines;
    total.matched += r.matched;
    total.skippedCount += r.skippedCount;
    total.skipped.push(...r.skipped.map((s) => ({ file: f.name, ...s })));
    total.columns = { ...total.columns, ...(r.columns as Record<string, string>) };
    total.commissionColumn ??= r.commissionColumn;
  }
  if (!total.lines) return NextResponse.json({ error: total.skipped[0]?.reason ?? "Không đọc được dòng nào", ...total }, { status: 400 });
  return NextResponse.json({ ok: true, ...total });
}

import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { importShopeeCsv } from "@/lib/shopee-csv";

export const maxDuration = 300;

/** Admin tải lên file CSV "Lấy link sản phẩm hàng loạt" của Shopee Affiliate */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.email)) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("file") ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return NextResponse.json({ error: "Chưa chọn file CSV" }, { status: 400 });
  if (files.some((f) => f.size > 5_000_000)) return NextResponse.json({ error: "File quá lớn (tối đa 5 MB)" }, { status: 400 });
  const total = { imported: 0, created: 0, updated: 0, noImage: 0, skipped: [] as { file: string; line: number; reason: string }[] };
  try {
    for (const f of files) {
      const r = await importShopeeCsv(await f.text());
      total.imported += r.imported;
      total.created += r.created;
      total.updated += r.updated;
      total.noImage += r.noImage;
      total.skipped.push(...r.skipped.map((s) => ({ file: f.name, ...s })));
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
  return NextResponse.json(total);
}

import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { affExportFile, affLinkExport, applyAffLinks, parseAffLinks } from "@/lib/afflinks";

export const dynamic = "force-dynamic";

async function admin() {
  const user = await getCurrentUser();
  return !!user && isAdmin(user.email);
}

/**
 * Quản trị › Sản phẩm › "Chưa có link affiliate":
 *   GET  ?format=csv|txt  -> tải danh sách link sản phẩm cần tạo link affiliate (dán vào công cụ tạo link hàng loạt của Shopee)
 *   POST file / text      -> file kết quả từ Shopee (mỗi dòng có link sản phẩm + link s.shopee.vn) -> thay link mua
 */
export async function GET(req: Request) {
  if (!(await admin())) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  const format = new URL(req.url).searchParams.get("format") === "txt" ? "txt" : "csv";
  const e = await affLinkExport();
  const day = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  return new NextResponse(affExportFile(e, format), {
    headers: {
      "content-type": format === "txt" ? "text/plain; charset=utf-8" : "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="san-deal-can-link-affiliate-${day}.${format}"`,
      "cache-control": "no-store",
    },
  });
}

export async function POST(req: Request) {
  if (!(await admin())) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("file") ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  if (files.some((f) => f.size > 10_000_000)) return NextResponse.json({ error: "File quá lớn (tối đa 10 MB)" }, { status: 400 });
  if (files.some((f) => /\.xlsx?$/i.test(f.name))) return NextResponse.json({ error: "Đây là file Excel – mở file, chọn Lưu thành › CSV rồi tải lên, hoặc chép các ô có link rồi dán vào ô bên dưới" }, { status: 400 });
  const text = [...(await Promise.all(files.map((f) => f.text()))), String(form?.get("text") ?? "")].join("\n");
  if (!text.trim()) return NextResponse.json({ error: "Chưa chọn file hoặc chưa dán link" }, { status: 400 });
  const parsed = parseAffLinks(text);
  if (!parsed.pairs.size) {
    return NextResponse.json(
      { error: "Không thấy dòng nào có đủ link sản phẩm Shopee và link affiliate (s.shopee.vn). Hãy dùng file kết quả Shopee trả về sau khi tạo link (mỗi dòng có cả link gốc và link rút gọn)." },
      { status: 400 },
    );
  }
  return NextResponse.json(await applyAffLinks(parsed));
}

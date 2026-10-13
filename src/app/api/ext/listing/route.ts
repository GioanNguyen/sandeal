import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { LISTING_MAX_ITEMS, markListingDone, recordListing, type ListingItem } from "@/lib/listing";
import { clientIp } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Tiện ích (trình duyệt đăng nhập tài khoản quản trị) gửi các ô sản phẩm đọc được trên 1 trang danh sách của sàn
 * (tìm kiếm, danh mục, Flash Sale): { pageUrl, key?, category?, items: [{ url, name, price, originalPrice?, image? }] }.
 * key: trang trong hàng đợi quét (lib/listing.ts) -> ghi đã quét. Trả số món tạo mới / cập nhật giá / bỏ qua.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.email)) return NextResponse.json({ error: "Không có quyền" }, { status: 403, headers: NO_STORE });
  const text = await req.text();
  if (text.length > 300_000) return NextResponse.json({ error: "Dữ liệu quá lớn" }, { status: 413, headers: NO_STORE });
  let b: { items?: unknown; key?: unknown; category?: unknown } = {};
  try {
    b = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400, headers: NO_STORE });
  }
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, LISTING_MAX_ITEMS) as ListingItem[];
  const category = typeof b.category === "string" && b.category.length <= 60 ? b.category : undefined;
  const stats = await recordListing(items, { observer: `listing:${clientIp(req)}`, category });
  if (typeof b.key === "string") await markListingDone(b.key, stats);
  return NextResponse.json({ ok: true, ...stats }, { headers: NO_STORE });
}

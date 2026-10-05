import { NextResponse } from "next/server";
import { jobStates } from "@/lib/ops";

export const dynamic = "force-dynamic";

/**
 * Cho dịch vụ theo dõi bên ngoài (UptimeRobot, BetterStack…): 200 khi web + cơ sở dữ liệu chạy và giá vẫn được đồng bộ,
 * 503 khi có sự cố. Không lộ chi tiết lỗi (chỉ quản trị viên xem ở /admin/hom-nay).
 */
export async function GET() {
  try {
    const sync = (await jobStates()).find((j) => j.name === "sync");
    const ok = !sync?.stale;
    return NextResponse.json({ ok, db: true, sync: sync?.state ? (sync.stale ? "stale" : "ok") : "unknown" }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, db: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

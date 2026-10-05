import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { runSync } from "@/worker/sync";
import { recordJob } from "@/lib/ops";

export const maxDuration = 300;

export async function POST() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.email)) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  const report = await runSync();
  await recordJob("sync", { ok: !report.errors.length, error: report.errors.join(" · ") || null, summary: `${report.products} món, ${report.vouchers} mã, ${Math.round(report.ms / 1000)} giây` });
  return NextResponse.json(report);
}

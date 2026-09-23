import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { runSync } from "@/worker/sync";

export const maxDuration = 300;

export async function POST() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.email)) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  const report = await runSync();
  return NextResponse.json(report);
}

import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { clearMockData } from "@/lib/clear-mock";

export async function POST() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.email)) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  try {
    return NextResponse.json(await clearMockData());
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

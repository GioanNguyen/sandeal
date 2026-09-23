import { NextResponse } from "next/server";
import { dealsByIds } from "@/lib/queries";

export async function GET(req: Request) {
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").map(Number);
  return NextResponse.json({ items: await dealsByIds(ids) });
}

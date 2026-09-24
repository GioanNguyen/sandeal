import { NextResponse } from "next/server";
import { siteUrl } from "@/lib/mail";
import { createList } from "@/lib/play";
import { allow, clientIp } from "@/lib/ratelimit";

/** Tạo link chia sẻ cho danh sách deal (không cần đăng nhập, giới hạn 20 link/giờ mỗi IP) */
export async function POST(req: Request) {
  if (!(await allow(`list:${clientIp(req)}`, 20, 3600))) return NextResponse.json({ error: "Bạn tạo link hơi nhanh, thử lại sau ít phút" }, { status: 429 });
  const body = await req.json().catch(() => null);
  const r = await createList(body?.title, body?.ids);
  if ("error" in r) return NextResponse.json(r, { status: 400 });
  return NextResponse.json({ slug: r.slug, url: `${siteUrl()}/ds/${r.slug}` });
}

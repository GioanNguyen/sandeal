import { NextResponse } from "next/server";
import { consumeLoginToken, sessionCookie } from "@/lib/auth";

/** POST từ trang /auth/verify (dùng POST để trình quét link trong email không tự "bấm" mất token) */
export async function POST(req: Request) {
  const form = await req.formData();
  const token = String(form.get("token") ?? "");
  const result = token ? await consumeLoginToken(token) : null;
  if (!result) return NextResponse.redirect(new URL("/login?expired=1", req.url), 303);
  const to = result.addedProductId ? `/account?added=${result.addedProductId}` : "/account";
  const res = NextResponse.redirect(new URL(to, req.url), 303);
  res.cookies.set(sessionCookie(result.sessionToken));
  return res;
}

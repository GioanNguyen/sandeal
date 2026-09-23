import { NextResponse } from "next/server";
import { EMAIL_RE, normalizeEmail, safeNext, sendLoginLink } from "@/lib/auth";
import { allow, clientIp } from "@/lib/ratelimit";

/** Nhận JSON (từ JS) hoặc form thường (khi JS chưa tải xong) */
export async function POST(req: Request) {
  const isForm = !(req.headers.get("content-type") ?? "").includes("json");
  const body: Record<string, unknown> | null = isForm
    ? Object.fromEntries((await req.formData().catch(() => new FormData())).entries())
    : await req.json().catch(() => null);
  const reply = (status: number, error?: string) =>
    isForm
      ? NextResponse.redirect(new URL(error ? `/login?error=${encodeURIComponent(error)}` : "/login?sent=1", req.url), 303)
      : NextResponse.json(error ? { error } : { ok: true }, { status });

  if (body?.website) return reply(200);
  const email = normalizeEmail(body?.email);
  if (!EMAIL_RE.test(email)) return reply(400, "Email không hợp lệ");
  if (!(await allow(`login:ip:${clientIp(req)}`, 10, 3600)) || !(await allow(`mail:${email}`, 5, 3600))) {
    return reply(429, "Bạn gửi quá nhiều yêu cầu, thử lại sau ít phút.");
  }
  await sendLoginLink(email, undefined, safeNext(body?.next));
  return reply(200);
}

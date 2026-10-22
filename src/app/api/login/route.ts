import { redirectTo } from "@/lib/redirect";
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
      ? redirectTo(error ? `/login?error=${encodeURIComponent(error)}` : "/login?sent=1", 303)
      : NextResponse.json(error ? { error } : { ok: true }, { status });

  if (body?.website) return reply(200);
  const email = normalizeEmail(body?.email);
  if (!EMAIL_RE.test(email)) return reply(400, "Email không hợp lệ");
  if (!(await allow(`login:ip:${clientIp(req)}`, 10, 3600)) || !(await allow(`mail:${email}`, 5, 3600))) {
    return reply(429, "Bạn gửi quá nhiều yêu cầu, thử lại sau ít phút.");
  }
  try {
    await sendLoginLink(email, undefined, safeNext(body?.next));
  } catch (e) {
    // Thường do SMTP: sai App Password, Gmail chặn đăng nhập, nhà cung cấp VPS chặn cổng 465/587. Ghi rõ vào log máy chủ.
    const err = e as Error & { code?: string; responseCode?: number; command?: string };
    console.error(`[login] gửi link đăng nhập tới ${email} thất bại: ${err.code ?? ""} ${err.responseCode ?? ""} ${err.command ?? ""} ${err.message}`);
    return reply(502, "Chưa gửi được email đăng nhập (máy chủ email đang lỗi). Thử lại sau ít phút.");
  }
  return reply(200);
}

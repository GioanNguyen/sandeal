import { redirectTo } from "@/lib/redirect";
import { consumeLoginToken, getCurrentUser, safeNext, sessionCookie } from "@/lib/auth";

/** POST từ trang /auth/verify (dùng POST để trình quét link trong email không tự "bấm" mất token) */
export async function POST(req: Request) {
  const form = await req.formData();
  const token = String(form.get("token") ?? "");
  const result = token ? await consumeLoginToken(token) : null;
  if (!result) {
    // Link đã dùng rồi (vd bấm Xác nhận 2 lần) nhưng trình duyệt đã đăng nhập -> vào thẳng tài khoản
    if (await getCurrentUser().catch(() => null)) return redirectTo(safeNext(form.get("next")) ?? "/account", 303);
    return redirectTo("/login?expired=1", 303);
  }
  const to = result.addedProductId ? `/account?added=${result.addedProductId}` : safeNext(form.get("next")) ?? "/account";
  const res = redirectTo(to, 303);
  res.cookies.set(sessionCookie(result.sessionToken));
  return res;
}

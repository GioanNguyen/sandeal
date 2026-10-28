import nodemailer from "nodemailer";

export const siteUrl = () => (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");

/** Email gửi gần nhất (để test/dev xem lại link khi chưa cấu hình SMTP) */
export const outbox: { to: string; subject: string; html: string }[] = [];

export async function sendMail(to: string, subject: string, html: string) {
  outbox.push({ to, subject, html });
  if (outbox.length > 50) outbox.shift();
  if (!process.env.SMTP_URL) {
    const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    console.log(`[mail] (chưa cấu hình SMTP) -> ${to}: ${subject}\n        ${links.join("\n        ")}`);
    return;
  }
  const transport = nodemailer.createTransport(process.env.SMTP_URL);
  try {
    await transport.sendMail({ from: process.env.MAIL_FROM, to, subject, html });
  } catch (err) {
    await reportMail(false, mailErrorText(err));
    throw err;
  }
  await reportMail(true);
}

/** Lỗi gửi mail kèm cách sửa (hiện ở Quản trị › Hôm nay và tin báo Telegram) */
export function mailErrorText(err: unknown): string {
  const e = err as Error & { code?: string; responseCode?: number };
  const code = [e?.code, e?.responseCode].filter(Boolean).join(" ");
  const msg = String(e?.message ?? err).replace(/\s+/g, " ").slice(0, 200);
  const hint =
    e?.code === "EAUTH" || e?.responseCode === 535
      ? "Sai hoặc đã bị thu hồi mật khẩu ứng dụng (App Password) Gmail: tạo mật khẩu mới, sửa SMTP_URL trong .env rồi khởi động lại dịch vụ."
      : /ETIMEDOUT|ECONNREFUSED|ESOCKET|ECONNECTION|EHOSTUNREACH/.test(e?.code ?? "")
        ? "Không kết nối được máy chủ mail: nhà cung cấp VPS có thể chặn cổng 465/587, hoặc SMTP_URL sai địa chỉ."
        : "Kiểm tra SMTP_URL, MAIL_FROM trong .env.";
  return `${code ? `${code}: ` : ""}${msg} → ${hint}`;
}

/**
 * Ghi tình trạng gửi mail vào mục "Việc định kỳ" (ops.ts, việc "mail"): lỗi 2 lần liên tiếp thì báo quản trị viên qua
 * Telegram (email đang hỏng nên không báo được bằng email) và hiện sự cố ở Quản trị › Hôm nay; gửi lại được thì báo "ổn lại".
 * Gửi thành công chỉ ghi tối đa 1 lần/giờ (trừ ngay sau khi đang lỗi) để không ghi CSDL theo từng email.
 */
const mailState = globalThis as unknown as { __mailReport?: { busy: boolean; failing: boolean; okAt: number } };
const ms = (mailState.__mailReport ??= { busy: false, failing: false, okAt: 0 });
async function reportMail(ok: boolean, error?: string) {
  // Đang báo (báo có thể lại gửi mail khi chưa có Telegram) -> không báo lồng nhau
  if (ms.busy) return;
  if (ok && !ms.failing && Date.now() - ms.okAt < 3_600_000) return;
  ms.busy = true;
  try {
    const { recordJob } = await import("./ops");
    await recordJob("mail", ok ? { ok: true } : { ok: false, error });
    ms.failing = !ok;
    if (ok) ms.okAt = Date.now();
  } catch {
    /* ghi trạng thái lỗi không được làm hỏng việc gửi mail */
  } finally {
    ms.busy = false;
  }
}

export function layout(body: string) {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1c1a19">
  <div style="font-weight:800;font-size:20px;color:#d0390f;margin-bottom:16px">Săn Deal</div>
  ${body}
  <p style="color:#5b6170;font-size:12px;margin-top:32px">Bạn nhận email này vì đã đăng ký trên ${siteUrl()}.</p>
</div>`;
}

export const button = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:#d0390f;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px">${label}</a>`;

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

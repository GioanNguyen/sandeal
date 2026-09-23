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
  await transport.sendMail({ from: process.env.MAIL_FROM, to, subject, html });
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

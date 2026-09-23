import nodemailer from "nodemailer";
import { prisma } from "@/lib/db";
import { vnd } from "@/lib/format";

const DAY = 86_400_000;

async function send(to: string, subject: string, html: string) {
  if (!process.env.SMTP_URL) {
    console.log(`[mail] (chưa cấu hình SMTP) -> ${to}: ${subject}`);
    return;
  }
  const transport = nodemailer.createTransport(process.env.SMTP_URL);
  await transport.sendMail({ from: process.env.MAIL_FROM, to, subject, html });
}

/** Gửi email khi giá ≤ giá mục tiêu; tối đa 1 email/ngày cho mỗi lượt theo dõi */
export async function notifyWatchers(now = new Date()): Promise<number> {
  const watches = await prisma.watch.findMany({
    where: { OR: [{ lastNotifiedAt: null }, { lastNotifiedAt: { lt: new Date(now.getTime() - DAY) } }] },
    include: { product: true },
  });
  const site = process.env.SITE_URL || "http://localhost:3000";
  let sent = 0;
  for (const w of watches) {
    if (w.product.price > w.targetPrice) continue;
    await send(
      w.email,
      `Giảm giá: ${w.product.name} còn ${vnd(w.product.price)}`,
      `<p><b>${w.product.name}</b> đang có giá <b>${vnd(w.product.price)}</b> (mục tiêu của bạn: ${vnd(w.targetPrice)}).</p>
       <p><a href="${w.product.affiliateUrl}">Mua ngay</a> · <a href="${site}/product/${w.product.id}">Xem lịch sử giá</a></p>`,
    );
    await prisma.watch.update({ where: { id: w.id }, data: { lastNotifiedAt: now } });
    sent++;
  }
  return sent;
}

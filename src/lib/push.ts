import webpush from "web-push";
import { eq, inArray } from "drizzle-orm";
import { pushSubscriptions } from "@/db/schema";
import { db } from "./db";

export interface PushPayload { title: string; body: string; url: string; image?: string | null; tag?: string }

let configured: boolean | null = null;
export function pushEnabled() {
  if (configured !== null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  configured = !!(pub && priv);
  if (configured) webpush.setVapidDetails(process.env.VAPID_SUBJECT || `mailto:${process.env.MAIL_FROM?.match(/<(.+)>/)?.[1] ?? "admin@example.com"}`, pub!, priv!);
  return configured;
}

/** Gửi thông báo tới mọi thiết bị của người dùng; xoá đăng ký đã hết hạn. Trả về số thiết bị nhận được. */
export async function sendPush(userId: number, payload: PushPayload): Promise<number> {
  if (!pushEnabled()) return 0;
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  const dead: string[] = [];
  let ok = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 86_400 });
        ok++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.endpoint);
        else console.warn("[push] lỗi:", code, (err as Error).message);
      }
    }),
  );
  if (dead.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, dead));
  return ok;
}

/**
 * Báo giá qua Zalo Official Account (OA).
 *
 * Quy định của Zalo (xem docs/zalo-oa.md): OA chỉ gửi "tin tư vấn" cho người đã tương tác với OA trong 7 ngày gần nhất
 * (miễn phí 8 tin trong 48 giờ sau mỗi lần tương tác, ngoài ra có phí). Vì vậy Zalo là kênh bổ sung: quá 7 ngày không
 * tương tác thì không gửi Zalo (email + thông báo đẩy vẫn gửi như cũ), và tin gửi đi nhắc người dùng nhắn lại để gia hạn.
 *
 * Token: access token hết hạn sau ~25 giờ; refresh token chỉ dùng được 1 lần và được thay bằng cái mới sau mỗi lần làm mới,
 * nên cặp token mới nhất được lưu trong bảng kv_store (ZALO_REFRESH_TOKEN trong .env chỉ dùng cho lần đầu).
 */
import { createHash, randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import { kvStore, subscriptions } from "@/db/schema";
import { db } from "./db";

const DAY = 86_400_000;
export const ZALO_WINDOW_DAYS = 7;
const TOKEN_KEY = "zalo_oa_token";

export const zaloOaId = () => process.env.ZALO_OA_ID?.trim() || "";
export const zaloOaUrl = () => (zaloOaId() ? `https://zalo.me/${zaloOaId()}` : "");
export const zaloEnabled = () => !!(process.env.ZALO_APP_ID && process.env.ZALO_APP_SECRET && zaloOaId());

/** Còn trong khung 7 ngày kể từ lần tương tác gần nhất (chừa 1 giờ an toàn) */
export function zaloWindowOpen(lastSeen: Date | null | undefined, now = new Date()) {
  return !!lastSeen && now.getTime() - lastSeen.getTime() < ZALO_WINDOW_DAYS * DAY - 3_600_000;
}
export const zaloWindowEnds = (lastSeen: Date) => new Date(lastSeen.getTime() + ZALO_WINDOW_DAYS * DAY);

/** Mã liên kết 6 ký tự, bỏ các ký tự dễ nhầm (0/O, 1/I/L) */
export function newLinkCode() {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => A[randomInt(A.length)]).join("");
}
/** Tìm mã liên kết trong tin người dùng gửi: "SD ABC123", "abc123"… */
export function linkCodeIn(text: string) {
  const m = text.toUpperCase().match(/(?:^|[^A-Z0-9])([A-HJ-KM-NP-Z2-9]{6})(?![A-Z0-9])/);
  return m?.[1] ?? null;
}

/**
 * Chữ ký webhook: X-ZEvent-Signature = "mac=" + sha256(appId + nội dung + timestamp + OA secret key).
 */
export function verifyZaloSignature(raw: string, header: string | null, timestamp: string | number | undefined) {
  const secret = process.env.ZALO_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production"; // khi dev cho phép thử không cần khoá
  if (!header || timestamp == null) return false;
  const mac = createHash("sha256").update(`${process.env.ZALO_APP_ID}${raw}${timestamp}${secret}`).digest("hex");
  return header.replace(/^mac=/, "").toLowerCase() === mac;
}

type Token = { access: string; refresh: string; exp: number };

async function loadToken(): Promise<Token | null> {
  const [row] = await db.select().from(kvStore).where(eq(kvStore.key, TOKEN_KEY)).limit(1);
  try {
    return row ? (JSON.parse(row.value) as Token) : null;
  } catch {
    return null;
  }
}
async function saveToken(t: Token) {
  const value = JSON.stringify(t);
  await db.insert(kvStore).values({ key: TOKEN_KEY, value }).onConflictDoUpdate({ target: kvStore.key, set: { value, updatedAt: new Date() } });
}

let refreshing: Promise<string | null> | null = null;

/** Access token còn hạn; hết hạn thì làm mới bằng refresh token mới nhất */
export async function zaloAccessToken(force = false): Promise<string | null> {
  if (!zaloEnabled()) return null;
  const cur = await loadToken();
  if (!force && cur && cur.exp > Date.now() + 5 * 60_000) return cur.access;
  refreshing ??= (async () => {
    const refresh = cur?.refresh || process.env.ZALO_REFRESH_TOKEN;
    if (!refresh) {
      console.warn("[zalo] Thiếu ZALO_REFRESH_TOKEN");
      return null;
    }
    const res = await fetch("https://oauth.zaloapp.com/v4/oa/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", secret_key: process.env.ZALO_APP_SECRET! },
      body: new URLSearchParams({ refresh_token: refresh, app_id: process.env.ZALO_APP_ID!, grant_type: "refresh_token" }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { access_token?: string; refresh_token?: string; expires_in?: string | number; error?: number; error_name?: string } | null;
    if (!json?.access_token || !json.refresh_token) {
      console.warn("[zalo] Làm mới token lỗi:", json?.error, json?.error_name, "– cấp lại ZALO_REFRESH_TOKEN nếu refresh token đã hết hạn (3 tháng)");
      return null;
    }
    await saveToken({ access: json.access_token, refresh: json.refresh_token, exp: Date.now() + Number(json.expires_in ?? 90000) * 1000 });
    return json.access_token;
  })().finally(() => (refreshing = null));
  return refreshing;
}

/** Gửi tin tư vấn dạng chữ. Trả về true nếu Zalo nhận tin. */
export async function sendZaloText(zaloUserId: string, text: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await zaloAccessToken(attempt > 0);
    if (!token) return false;
    const res = await fetch("https://openapi.zalo.me/v3.0/oa/message/cs", {
      method: "POST",
      headers: { "Content-Type": "application/json", access_token: token },
      body: JSON.stringify({ recipient: { user_id: zaloUserId }, message: { text: text.slice(0, 2000) } }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { error?: number; message?: string } | null;
    if (json?.error === 0) return true;
    // -216: access token không hợp lệ -> làm mới rồi thử lại 1 lần
    if (json?.error === -216 && attempt === 0) continue;
    console.warn(`[zalo] gửi tới ${zaloUserId} lỗi ${json?.error}: ${json?.message ?? res?.status}`);
    return false;
  }
  return false;
}

/**
 * Báo cho 1 người dùng qua Zalo nếu đã liên kết, đang bật nhận tin và còn trong khung 7 ngày.
 * Gần hết khung thì nhắc nhắn lại để tiếp tục nhận. Không bao giờ ném lỗi (không làm hỏng email/thông báo đẩy).
 */
export async function notifyZalo(userId: number, text: string, now = new Date()): Promise<boolean> {
  try {
    if (!zaloEnabled()) return false;
    const [s] = await db
      .select({ id: subscriptions.zaloUserId, on: subscriptions.zaloAlerts, seen: subscriptions.zaloLastSeenAt })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);
    if (!s?.id || !s.on || !zaloWindowOpen(s.seen, now)) return false;
    const daysLeft = Math.floor((zaloWindowEnds(s.seen!).getTime() - now.getTime()) / DAY);
    const footer = daysLeft <= 3 ? `\n\n(Zalo chỉ cho Săn Deal nhắn bạn thêm ${Math.max(0, daysLeft)} ngày nữa. Trả lời "ok" để tiếp tục nhận báo giá qua Zalo.)` : "";
    return await sendZaloText(s.id, text + footer);
  } catch (err) {
    console.warn("[zalo] lỗi:", (err as Error).message);
    return false;
  }
}

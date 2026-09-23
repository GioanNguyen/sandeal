import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { loginTokens, sessions, users, watches } from "@/db/schema";
import { db, ensureMigrated } from "./db";
import { button, escapeHtml, layout, sendMail, siteUrl } from "./mail";

export const SESSION_COOKIE = "sd_session";
const SESSION_DAYS = 30;
const LOGIN_TTL_MIN = 30;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const normalizeEmail = (e: unknown) => String(e ?? "").trim().toLowerCase();

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("Thiếu AUTH_SECRET");
  return s || "dev-secret-change-me";
}

/** Gửi link đăng nhập; nếu có pendingWatch thì link sẽ tạo luôn lượt theo dõi sau khi xác minh email */
/** Chỉ cho phép chuyển hướng nội bộ (chặn open redirect) */
export const safeNext = (n: unknown) => (typeof n === "string" && /^\/(?!\/)/.test(n) ? n : undefined);

export async function sendLoginLink(
  email: string,
  pendingWatch?: { productId: number; targetPrice: number; productName?: string },
  next?: string,
) {
  await ensureMigrated();
  const token = newToken();
  await db.insert(loginTokens).values({
    tokenHash: sha256(token),
    email,
    expiresAt: new Date(Date.now() + LOGIN_TTL_MIN * 60_000),
    pendingWatch: pendingWatch ? { productId: pendingWatch.productId, targetPrice: pendingWatch.targetPrice } : null,
  });
  const n = safeNext(next);
  const url = `${siteUrl()}/auth/verify?token=${token}${n ? `&next=${encodeURIComponent(n)}` : ""}`;
  const intro = pendingWatch?.productName
    ? `<p>Bấm nút dưới đây để xác nhận email và bắt đầu theo dõi giá <b>${escapeHtml(pendingWatch.productName)}</b>.</p>`
    : `<p>Bấm nút dưới đây để đăng nhập Săn Deal.</p>`;
  await sendMail(
    email,
    pendingWatch ? "Xác nhận theo dõi giá – Săn Deal" : "Link đăng nhập Săn Deal",
    layout(`${intro}<p>${button(url, pendingWatch ? "Xác nhận & theo dõi" : "Đăng nhập")}</p>
      <p style="color:#5b6170;font-size:13px">Link có hiệu lực trong ${LOGIN_TTL_MIN} phút và chỉ dùng được một lần. Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>`),
  );
  return token;
}

/** Dùng token: tạo user nếu chưa có, tạo session, tạo lượt theo dõi đang chờ. */
export async function consumeLoginToken(token: string) {
  await ensureMigrated();
  const hash = sha256(token);
  const [row] = await db
    .update(loginTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(loginTokens.tokenHash, hash), isNull(loginTokens.usedAt), gt(loginTokens.expiresAt, new Date())))
    .returning();
  if (!row) return null;

  const [user] = await db
    .insert(users)
    .values({ email: row.email })
    .onConflictDoUpdate({ target: users.email, set: { email: row.email } })
    .returning();

  let addedProductId: number | undefined;
  if (row.pendingWatch) {
    await upsertWatch(user.id, row.pendingWatch.productId, row.pendingWatch.targetPrice);
    addedProductId = row.pendingWatch.productId;
  }
  const sessionToken = await createSession(user.id);
  // dọn token hết hạn
  await db.delete(loginTokens).where(lt(loginTokens.expiresAt, new Date(Date.now() - 86_400_000)));
  return { user, sessionToken, addedProductId };
}

export async function upsertWatch(userId: number, productId: number, targetPrice: number) {
  await db
    .insert(watches)
    .values({ userId, productId, targetPrice })
    .onConflictDoUpdate({ target: [watches.userId, watches.productId], set: { targetPrice, lastNotifiedAt: null } });
}

async function createSession(userId: number) {
  const token = newToken();
  await db.insert(sessions).values({
    tokenHash: sha256(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000),
  });
  return token;
}

export const sessionCookie = (token: string) => ({
  name: SESSION_COOKIE,
  value: token,
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production" && siteUrl().startsWith("https"),
  path: "/",
  maxAge: SESSION_DAYS * 86_400,
});

export async function getCurrentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  await ensureMigrated();
  const [row] = await db
    .select({ id: users.id, email: users.email })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

export async function destroySession(token: string | undefined) {
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
}

export function isAdmin(email: string | undefined | null) {
  if (!email) return false;
  return (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).includes(email);
}

/** Chữ ký cho link huỷ theo dõi trong email (không cần đăng nhập) */
export function unsubscribeSig(watchId: number) {
  return createHmac("sha256", secret()).update(`unsub:${watchId}`).digest("base64url").slice(0, 22);
}
export function verifyUnsubscribeSig(watchId: number, sig: string) {
  const a = Buffer.from(unsubscribeSig(watchId));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
export const unsubscribeUrl = (watchId: number) => `${siteUrl()}/unsubscribe?w=${watchId}&s=${unsubscribeSig(watchId)}`;

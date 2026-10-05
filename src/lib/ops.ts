/**
 * Vận hành: ghi lại các việc chạy định kỳ (lần chạy, lỗi) và báo cho quản trị viên khi có sự cố.
 *
 * Báo qua Telegram (nhanh, trên điện thoại) nếu có; không thì email ADMIN_EMAILS.
 *   - ADMIN_TELEGRAM_CHAT_ID: mã chat Telegram nhận báo (bỏ trống = tự dùng Telegram mà tài khoản quản trị đã liên kết
 *     ở trang Tài khoản › Sở thích & thông báo)
 *   - ADMIN_ALERTS=0 tắt mọi tin báo · ADMIN_ALERT_EMAIL=1 gửi cả email khi đã có Telegram
 * Mỗi sự cố chỉ báo 1 lần trong ALERT_COOLDOWN giờ; hết sự cố thì báo "đã ổn lại".
 */
import { and, eq, inArray, isNotNull, like } from "drizzle-orm";
import { kvStore, subscriptions, users } from "@/db/schema";
import { db, ensureMigrated } from "./db";
import { escapeHtml, layout, sendMail, siteUrl } from "./mail";
import { sendTelegram } from "./telegram";

const HOUR = 3_600_000;
export const ALERT_COOLDOWN_HOURS = 12;

// ---------- Ghi lại các việc định kỳ ----------

export interface JobState {
  lastRun: string;
  lastOk: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  /** Số lần lỗi liên tiếp */
  fails: number;
  summary?: string | null;
}

/** Tên hiển thị + sau bao lâu không chạy được là "đứng" (giờ; null = không theo dõi) + lỗi mấy lần liên tiếp thì báo */
export const JOBS: Record<string, { label: string; staleHours: number | null; alertAfter: number; href?: string }> = {
  sync: { label: "Đồng bộ giá, mã giảm giá, đơn hàng", staleHours: Number(process.env.SYNC_STALE_HOURS) || 6, alertAfter: 2, href: "/admin" },
  social: { label: "Đăng Facebook giờ vàng", staleHours: null, alertAfter: 1, href: "/admin/dang-bai" },
  reels: { label: "Đăng Reels", staleHours: null, alertAfter: 1, href: "/admin/dang-bai" },
  giaao: { label: "Bài bóc giá ảo", staleHours: null, alertAfter: 1, href: "/admin/dang-bai" },
  guides: { label: "Đăng bài hướng dẫn", staleHours: null, alertAfter: 1, href: "/admin/huong-dan" },
  indexnow: { label: "Báo công cụ tìm kiếm (IndexNow)", staleHours: null, alertAfter: 3, href: "/admin/tim-kiem" },
  autocat: { label: "Tự xếp danh mục", staleHours: null, alertAfter: 3, href: "/admin/san-pham" },
  images: { label: "Lấy ảnh sản phẩm", staleHours: null, alertAfter: 3, href: "/admin/san-pham" },
  digest: { label: "Bản tin, nhắc sale cho người dùng", staleHours: null, alertAfter: 3 },
};

const jobKey = (name: string) => `job:${name}`;

async function kvGet<T>(key: string): Promise<T | null> {
  const [row] = await db.select().from(kvStore).where(eq(kvStore.key, key)).limit(1);
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}
async function kvSet(key: string, v: unknown, now = new Date()) {
  const value = JSON.stringify(v);
  await db.insert(kvStore).values({ key, value, updatedAt: now }).onConflictDoUpdate({ target: kvStore.key, set: { value, updatedAt: now } });
}

/** Ghi kết quả 1 lần chạy; lỗi đủ số lần liên tiếp thì báo, chạy lại được sau khi đã báo thì báo "ổn lại" */
export async function recordJob(name: string, result: { ok: boolean; error?: string | null; summary?: string | null }, now = new Date()) {
  try {
    await ensureMigrated();
    const prev = await kvGet<JobState>(jobKey(name));
    const fails = result.ok ? 0 : (prev?.fails ?? 0) + 1;
    const state: JobState = {
      lastRun: now.toISOString(),
      lastOk: result.ok ? now.toISOString() : prev?.lastOk ?? null,
      lastError: result.ok ? prev?.lastError ?? null : (result.error ?? "Lỗi không rõ").slice(0, 500),
      lastErrorAt: result.ok ? prev?.lastErrorAt ?? null : now.toISOString(),
      fails,
      summary: result.summary ?? prev?.summary ?? null,
    };
    await kvSet(jobKey(name), state, now);
    const meta = JOBS[name];
    if (!result.ok && meta && fails >= meta.alertAfter) {
      await alertAdmin(`job-${name}`, `${meta.label} bị lỗi`, `Lỗi ${fails} lần liên tiếp. Lỗi gần nhất: ${state.lastError}`, { href: meta.href, now });
    } else if (result.ok) {
      await resolveAlert(`job-${name}`, `${meta?.label ?? name} đã chạy lại bình thường`, now);
    }
  } catch (err) {
    console.error(`[ops] không ghi được trạng thái ${name}:`, (err as Error).message);
  }
}

/** Chạy 1 việc và ghi kết quả (lỗi vẫn ném ra như cũ) */
export async function trackJob<T>(name: string, fn: () => Promise<T>, summarize?: (r: T) => string | null): Promise<T> {
  try {
    const r = await fn();
    await recordJob(name, { ok: true, summary: summarize ? summarize(r) : null });
    return r;
  } catch (err) {
    await recordJob(name, { ok: false, error: (err as Error).message });
    throw err;
  }
}

export async function jobStates(nowDate = new Date()): Promise<{ name: string; label: string; href?: string; state: JobState | null; stale: boolean }[]> {
  await ensureMigrated();
  const rows = await db.select().from(kvStore).where(like(kvStore.key, "job:%"));
  const by = new Map(rows.map((r) => [r.key.slice(4), r.value]));
  const now = nowDate.getTime();
  return Object.entries(JOBS)
    .map(([name, meta]) => {
      let state: JobState | null = null;
      try {
        state = by.has(name) ? (JSON.parse(by.get(name)!) as JobState) : null;
      } catch {
        state = null;
      }
      const lastOk = state?.lastOk ? Date.parse(state.lastOk) : null;
      const stale = !!(meta.staleHours && state && (!lastOk || now - lastOk > meta.staleHours * HOUR));
      return { name, label: meta.label, href: meta.href, state, stale };
    })
    .filter((j) => j.state || j.name === "sync");
}

// ---------- Báo cho quản trị viên ----------

export const alertsEnabled = () => process.env.ADMIN_ALERTS !== "0";
const adminEmails = () => (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

/** Nơi nhận báo: chat Telegram đặt trong .env, hoặc Telegram tài khoản quản trị đã liên kết */
export async function adminTelegramChats(): Promise<string[]> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return [];
  const fixed = (process.env.ADMIN_TELEGRAM_CHAT_ID || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (fixed.length) return fixed;
  const emails = adminEmails();
  if (!emails.length) return [];
  const rows = await db
    .select({ chat: subscriptions.telegramChatId })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .where(and(inArray(users.email, emails), isNotNull(subscriptions.telegramChatId)));
  return [...new Set(rows.map((r) => r.chat!).filter(Boolean))];
}

/** Gửi 1 tin cho quản trị viên (Telegram, không có thì email). Trả về kênh đã gửi */
export async function notifyAdmin(subject: string, text: string, opts: { href?: string; html?: string } = {}): Promise<string[]> {
  if (!alertsEnabled()) return [];
  const sent: string[] = [];
  const link = opts.href ? `${siteUrl()}${opts.href}` : `${siteUrl()}/admin/hom-nay`;
  const chats = await adminTelegramChats().catch(() => [] as string[]);
  for (const c of chats) {
    if (await sendTelegram(c, `<b>${escapeHtml(subject)}</b>\n${escapeHtml(text)}`, null, { text: "Mở trang quản trị", url: link })) sent.push("telegram");
  }
  if (!sent.length || process.env.ADMIN_ALERT_EMAIL === "1") {
    const html = layout(opts.html ?? `<p style="font-size:16px"><b>${escapeHtml(subject)}</b></p><p style="white-space:pre-line">${escapeHtml(text)}</p><p><a href="${link}">${link}</a></p>`);
    for (const e of adminEmails()) {
      await sendMail(e, `[Săn Deal] ${subject}`, html).catch((err) => console.error("[ops] gửi email lỗi:", (err as Error).message));
      sent.push("email");
    }
  }
  return [...new Set(sent)];
}

interface AlertState {
  title: string;
  detail: string;
  firstAt: string;
  lastSentAt: string;
  open: boolean;
  href?: string;
}

/** Báo sự cố (mỗi sự cố tối đa 1 lần / ALERT_COOLDOWN_HOURS giờ) */
export async function alertAdmin(key: string, title: string, detail: string, opts: { href?: string; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const prev = await kvGet<AlertState>(`alert:${key}`);
  if (prev?.open && now.getTime() - Date.parse(prev.lastSentAt) < ALERT_COOLDOWN_HOURS * HOUR) return false;
  await notifyAdmin(`⚠ ${title}`, detail, { href: opts.href });
  await kvSet(`alert:${key}`, { title, detail, firstAt: prev?.open ? prev.firstAt : now.toISOString(), lastSentAt: now.toISOString(), open: true, href: opts.href } satisfies AlertState, now);
  console.warn(`[ops] đã báo quản trị: ${title} – ${detail}`);
  return true;
}

/** Sự cố đã hết: báo 1 tin "ổn lại" nếu trước đó đã báo */
export async function resolveAlert(key: string, text: string, now = new Date()) {
  const prev = await kvGet<AlertState>(`alert:${key}`);
  if (!prev?.open) return false;
  await kvSet(`alert:${key}`, { ...prev, open: false }, now);
  await notifyAdmin(`✓ ${text}`, `Sự cố "${prev.title}" bắt đầu ${new Date(prev.firstAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} đã hết.`);
  return true;
}

/** Các sự cố đang mở (hiện trên trang Hôm nay) */
export async function openAlerts(): Promise<(AlertState & { key: string })[]> {
  await ensureMigrated();
  const rows = await db.select().from(kvStore).where(like(kvStore.key, "alert:%"));
  const out: (AlertState & { key: string })[] = [];
  for (const r of rows) {
    try {
      const a = JSON.parse(r.value) as AlertState;
      if (a.open) out.push({ ...a, key: r.key.slice(6) });
    } catch {
      /* bỏ qua */
    }
  }
  return out.sort((a, b) => b.lastSentAt.localeCompare(a.lastSentAt));
}

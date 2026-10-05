/**
 * Canh chừng site (mỗi 30 phút) và tin tóm tắt mỗi sáng cho quản trị viên.
 *  - Đồng bộ giá đứng quá SYNC_STALE_HOURS giờ (mặc định 6)
 *  - Bài đăng mạng xã hội lỗi (token hết hạn…)
 *  - Tỉ lệ huỷ đơn tăng vọt so với 90 ngày trước
 *  - Mỗi sáng ADMIN_BRIEF_HOUR giờ (mặc định 8, đặt "off" để tắt): số liệu hôm qua + việc cần làm
 * Lỗi của từng việc định kỳ được báo ngay khi xảy ra (lib/ops.ts › recordJob).
 * Lưu ý: tiến trình web dừng hẳn thì không tự báo được – nên dùng thêm dịch vụ theo dõi bên ngoài (vd UptimeRobot) gọi /api/health.
 */
import { and, desc, gte, isNotNull, lt, sql } from "drizzle-orm";
import { conversionItems, kvStore, socialPosts } from "@/db/schema";
import { db, ensureMigrated } from "@/lib/db";
import { vnd } from "@/lib/format";
import { alertAdmin, jobStates, notifyAdmin, resolveAlert } from "@/lib/ops";
import { dayStats, todoList, vnDayStart } from "@/lib/todo";

const DAY = 86_400_000;
const TZ_MS = 7 * 3_600_000;

/** Tỉ lệ huỷ (theo giá trị hàng) của các dòng đã có kết quả trong khoảng */
async function cancelShare(from: Date, to: Date) {
  const [r] = await db
    .select({
      orders: sql<number>`count(distinct ${conversionItems.orderId}) filter (where ${conversionItems.status} <> 'pending')`,
      done: sql<number>`coalesce(sum(${conversionItems.price} * ${conversionItems.qty}) filter (where ${conversionItems.status} = 'completed'), 0)`,
      cancelled: sql<number>`coalesce(sum(${conversionItems.price} * ${conversionItems.qty}) filter (where ${conversionItems.status} = 'cancelled'), 0)`,
    })
    .from(conversionItems)
    .where(and(gte(conversionItems.purchasedAt, from), lt(conversionItems.purchasedAt, to), sql`${conversionItems.source} <> 'mock'`));
  const done = Number(r?.done ?? 0);
  const cancelled = Number(r?.cancelled ?? 0);
  return { orders: Number(r?.orders ?? 0), rate: done + cancelled > 0 ? cancelled / (done + cancelled) : 0 };
}

export async function runWatchdog(now = new Date()) {
  await ensureMigrated();
  const out: string[] = [];
  // 1. Đồng bộ giá đứng
  const sync = (await jobStates(now)).find((j) => j.name === "sync");
  if (sync?.stale) {
    const last = sync.state?.lastOk ? new Date(sync.state.lastOk).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "chưa lần nào";
    if (await alertAdmin("sync-stale", "Giá chưa được đồng bộ lại", `Lần đồng bộ thành công gần nhất: ${last}. Giá và deal trên site đang cũ.${sync.state?.lastError ? ` Lỗi gần nhất: ${sync.state.lastError}` : ""}`, { href: "/admin/hom-nay", now })) out.push("sync-stale");
  } else if (sync?.state) await resolveAlert("sync-stale", "Đồng bộ giá đã chạy lại bình thường", now);

  // 2. Bài đăng mạng xã hội lỗi trong 2 giờ qua (token Facebook hết hạn, bị chặn…)
  const errs = await db
    .select({ channel: socialPosts.channel, error: socialPosts.error })
    .from(socialPosts)
    .where(and(isNotNull(socialPosts.error), gte(socialPosts.postedAt, new Date(now.getTime() - 2 * 3_600_000))))
    .orderBy(desc(socialPosts.postedAt))
    .limit(20);
  if (errs.length) {
    const tokenHint = errs.some((e) => /token|OAuth|session|190/i.test(e.error ?? "")) ? " Có vẻ token Facebook đã hết hạn – tạo token mới và cập nhật FB_PAGE_TOKEN." : "";
    if (await alertAdmin("social-error", "Đăng bài mạng xã hội bị lỗi", `${errs.length} bài lỗi trong 2 giờ qua (${[...new Set(errs.map((e) => e.channel))].join(", ")}). Lỗi gần nhất: ${(errs[0].error ?? "").slice(0, 200)}.${tokenHint}`, { href: "/admin/dang-bai", now })) out.push("social-error");
  } else {
    const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(socialPosts).where(and(isNotNull(socialPosts.error), gte(socialPosts.postedAt, new Date(now.getTime() - DAY))));
    if (!Number(n)) await resolveAlert("social-error", "Đăng bài mạng xã hội đã bình thường", now);
  }

  // 3. Tỉ lệ huỷ đơn tăng vọt (đơn đặt 7–21 ngày trước, đủ thời gian có kết quả)
  const recent = await cancelShare(new Date(now.getTime() - 21 * DAY), new Date(now.getTime() - 7 * DAY));
  const base = await cancelShare(new Date(now.getTime() - 111 * DAY), new Date(now.getTime() - 21 * DAY));
  if (recent.orders >= 10 && base.orders >= 20 && recent.rate > Math.max(base.rate * 2, base.rate + 0.15)) {
    if (
      await alertAdmin(
        "cancel-spike",
        "Tỉ lệ huỷ đơn tăng bất thường",
        `${Math.round(recent.rate * 100)}% giá trị đơn bị huỷ/trả hàng (đơn đặt 7–21 ngày trước, ${recent.orders} đơn) so với ${Math.round(base.rate * 100)}% trước đó. Kiểm tra món/kênh nào bị huỷ nhiều ở tab Doanh thu.`,
        { href: "/admin/doanh-thu", now },
      )
    )
      out.push("cancel-spike");
  } else if (recent.orders >= 10) await resolveAlert("cancel-spike", "Tỉ lệ huỷ đơn đã về mức bình thường", now);
  return out;
}

export const briefHour = () => {
  const v = (process.env.ADMIN_BRIEF_HOUR ?? "8").trim().toLowerCase();
  if (v === "off") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : 8;
};

/** Tin tóm tắt mỗi sáng: gửi 1 lần/ngày, từ giờ đã đặt trở đi */
export async function runDailyBrief(now = new Date(), opts: { force?: boolean } = {}): Promise<string[] | false> {
  const hour = briefHour();
  if (hour == null && !opts.force) return false;
  const vnHour = new Date(now.getTime() + TZ_MS).getUTCHours();
  if (!opts.force && vnHour < (hour ?? 8)) return false;
  await ensureMigrated();
  const dayKey = new Date(vnDayStart(now).getTime() + TZ_MS).toISOString().slice(0, 10);
  const key = `brief:${dayKey}`;
  if (!opts.force) {
    const [done] = await db.select().from(kvStore).where(sql`${kvStore.key} = ${key}`).limit(1);
    if (done) return false;
  }
  const [y, todo] = await Promise.all([dayStats(now, -1), todoList(now)]);
  const lines = [
    `Hôm qua: ${y.views.toLocaleString("vi-VN")} lượt xem món · ${y.clicks.toLocaleString("vi-VN")} lượt bấm Mua · ${y.searches} lượt tìm${y.zeroSearches ? ` (${y.zeroSearches} không ra kết quả)` : ""}`,
    `Đơn hàng ghi nhận: ${y.orders} đơn · ${vnd(y.commission)} hoa hồng (chưa trừ đơn huỷ sau này)`,
    "",
    todo.length ? `Việc cần làm (${todo.length}):` : "Không có việc gì cần làm – mọi thứ đang ổn.",
    ...todo.slice(0, 8).map((t) => `${t.level === "high" ? "❗" : t.level === "normal" ? "•" : "·"} ${t.title}`),
    ...(todo.length > 8 ? [`… và ${todo.length - 8} việc khác`] : []),
  ];
  const sent = await notifyAdmin(`Săn Deal sáng ${dayKey.slice(8, 10)}/${dayKey.slice(5, 7)}`, lines.join("\n"), { href: "/admin/hom-nay" });
  if (!opts.force) await db.insert(kvStore).values({ key, value: "1", updatedAt: now }).onConflictDoNothing();
  return sent;
}

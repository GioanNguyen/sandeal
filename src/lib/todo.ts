/**
 * "Việc cần làm hôm nay" (Quản trị › Hôm nay): gom việc đang rải ở các tab thành 1 danh sách có thứ tự ưu tiên,
 * mỗi việc có lý do và link tới đúng chỗ xử lý. Cùng số liệu dùng cho tin tóm tắt mỗi sáng gửi quản trị viên.
 */
import { and, count, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { clicks, conversionItems, productViews, products, searchLog, socialPosts } from "@/db/schema";
import { availableSql } from "./availability";
import { db, ensureMigrated } from "./db";
import { demandReport } from "./demand";
import { draftGuides, liveUpcomingGuides } from "./guides-db";
import { guidePublishAt } from "./guides";
import { categorySourceCounts, issueSql } from "./producthealth";
import { productIndexableSql } from "./seoquality";
import { STALE_PRICE_DAYS, stalePriceSummary } from "./extqueue";

const DAY = 86_400_000;
const TZ_MS = 7 * 3_600_000;

export type TodoLevel = "high" | "normal" | "low";
export interface TodoItem {
  key: string;
  level: TodoLevel;
  title: string;
  why: string;
  href: string;
  action: string;
  count?: number;
}

const cnt = async (where: ReturnType<typeof sql>) => Number((await db.select({ n: count() }).from(products).where(where))[0].n);

/** Mốc 0h hôm nay theo giờ Việt Nam */
export const vnDayStart = (now: Date, offsetDays = 0) => {
  const vn = new Date(now.getTime() + TZ_MS);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() + offsetDays) - TZ_MS);
};

export async function todoList(now = new Date()): Promise<TodoItem[]> {
  await ensureMigrated();
  const items: TodoItem[] = [];
  const avail = (k: Parameters<typeof issueSql>[0]) => cnt(sql`(${availableSql()} and ${issueSql(k, now)})`);
  const [drafts, upcoming, badPrice, badLink, priceJump, noImage, noCat, catSrc, demand, fbErr, lastImport, anyLine, bare, stale, lastFeed] = await Promise.all([
    draftGuides(),
    liveUpcomingGuides(now),
    avail("bad_price"),
    avail("bad_link"),
    avail("price_jump"),
    avail("no_image"),
    avail("no_category"),
    categorySourceCounts(),
    demandReport(7, now),
    db
      .select({ n: count(), last: sql<string | null>`(array_agg(${socialPosts.error} order by ${socialPosts.postedAt} desc))[1]` })
      .from(socialPosts)
      .where(and(isNotNull(socialPosts.error), gte(socialPosts.postedAt, new Date(now.getTime() - DAY)))),
    db.select({ at: conversionItems.importedAt, source: conversionItems.source }).from(conversionItems).where(sql`${conversionItems.source} <> 'mock'`).orderBy(desc(conversionItems.importedAt)).limit(1),
    db.select({ n: count() }).from(conversionItems).where(sql`${conversionItems.source} <> 'mock'`),
    cnt(sql`not ${productIndexableSql(now)} and not ${products.hidden}`),
    stalePriceSummary(now),
    // Lần cuối giá sản phẩm được cập nhật từ nguồn chính (CSV / API), theo từng sàn
    db
      .select({ platform: products.platform, at: sql<Date | string | null>`max(${products.lastSeenAt})` })
      .from(products)
      .where(sql`${products.priceSource} <> 'ext' and ${products.externalId} not like 'mock-%'`)
      .groupBy(products.platform),
  ]);

  // --- Cao: lỗi làm mất tiền / mất khách ngay ---
  if (Number(fbErr[0]?.n)) {
    items.push({ key: "fb-error", level: "high", title: `${fbErr[0].n} bài đăng mạng xã hội bị lỗi trong 24 giờ`, why: `Lỗi gần nhất: ${(fbErr[0].last ?? "").slice(0, 160)}`, href: "/admin/dang-bai", action: "Xem bài lỗi" });
  }
  if (badLink) items.push({ key: "bad-link", level: "high", count: badLink, title: `${badLink} món đang bán có link mua không hợp lệ`, why: "Khách bấm “Mua” không tới được sàn – mất hoa hồng.", href: "/admin/san-pham?loc=bad_link", action: "Sửa hoặc ẩn" });
  if (badPrice) items.push({ key: "bad-price", level: "high", count: badPrice, title: `${badPrice} món có giá bất thường`, why: "Giá ≤ 0, giá gạch thấp hơn giá bán hoặc giảm trên 95% – dễ mất lòng tin.", href: "/admin/san-pham?loc=bad_price", action: "Kiểm tra lại" });
  if (drafts.length) items.push({ key: "guide-draft", level: "high", count: drafts.length, title: `${drafts.length} bài hướng dẫn AI chờ bạn duyệt`, why: `“${drafts[0].title}”${drafts.length > 1 ? " và các bài khác" : ""} – chưa duyệt thì không được đăng.`, href: "/admin/huong-dan", action: "Đọc và duyệt" });

  // --- Thường ---
  const nextTwoWeeks = upcoming.filter((g) => guidePublishAt(g).getTime() - now.getTime() < 14 * DAY);
  if (!nextTwoWeeks.length && !drafts.length) items.push({ key: "guide-empty", level: "normal", title: "Lịch bài hướng dẫn 2 tuần tới đang trống", why: "Mỗi tuần 1 bài giữ cho site có nội dung mới (Google và người theo dõi Page).", href: "/admin/huong-dan", action: "Soạn bài" });
  if (priceJump) items.push({ key: "price-jump", level: "normal", count: priceJump, title: `${priceJump} món giá đổi gấp đôi / còn nửa trong 7 ngày`, why: "Có thể là sàn trả sai phân loại – mở sàn kiểm tra trước khi món lên deal hot.", href: "/admin/san-pham?loc=price_jump", action: "Kiểm tra" });
  const gaps = demand.rows.filter((r) => r.status === "missing" && r.searches >= 2);
  if (gaps.length) items.push({ key: "search-gap", level: "normal", count: gaps.length, title: `${gaps.length} từ khoá khách tìm nhưng không có kết quả (7 ngày)`, why: `Nhiều nhất: ${gaps.slice(0, 3).map((g) => `“${g.q}” (${g.searches} lượt)`).join(", ")}.`, href: "/admin/nhu-cau?ngay=7", action: "Nhập thêm món" });
  const wanted = demand.requests.top.filter((r) => r.count >= 2);
  if (wanted.length) items.push({ key: "requests", level: "normal", count: wanted.length, title: `${wanted.length} món khách dán link nhiều lần nhưng site chưa có`, why: "Khách đã định mua – nhập món vào để có trang và báo giá.", href: "/admin/nhu-cau", action: "Xem link" });
  const hasApi = !!(process.env.SHOPEE_APP_ID && process.env.SHOPEE_SECRET);
  const last = lastImport[0];
  if (!hasApi) {
    if (!Number(anyLine[0]?.n)) items.push({ key: "rev-first", level: "normal", title: "Chưa có số liệu hoa hồng", why: "Xuất báo cáo hoa hồng ở trang Shopee Affiliate rồi nhập để biết kênh, món nào ra tiền.", href: "/admin/doanh-thu", action: "Nhập CSV" });
    else if (last && now.getTime() - last.at.getTime() > 7 * DAY)
      items.push({ key: "rev-stale", level: "normal", title: `Báo cáo hoa hồng đã ${Math.floor((now.getTime() - last.at.getTime()) / DAY)} ngày chưa cập nhật`, why: "Nhập tệp mới để cập nhật đơn chờ → đã chốt / bị huỷ.", href: "/admin/doanh-thu", action: "Nhập CSV mới" });
  }
  // Giá sản phẩm: lâu chưa nhập CSV mới / món đang được quan tâm mà giá đã cũ
  if (!hasApi) {
    const old = lastFeed
      .map((f) => ({ platform: f.platform, days: f.at ? Math.floor((now.getTime() - new Date(f.at).getTime()) / DAY) : null }))
      .filter((f) => f.days != null && f.days >= STALE_PRICE_DAYS())
      .sort((a, b) => (b.days ?? 0) - (a.days ?? 0));
    if (old.length) {
      const label: Record<string, string> = { shopee: "Shopee", lazada: "Lazada", tiktok: "TikTok Shop" };
      items.push({
        key: "csv-stale",
        level: old[0].days! >= 7 ? "high" : "normal",
        title: `Đã ${old[0].days} ngày chưa nhập CSV sản phẩm ${old.map((o) => label[o.platform] ?? o.platform).join(", ")}`,
        why: `Giá trên site cũ dần và món sẽ bị coi là “không còn thấy trên sàn”.${stale.byCategory.length ? ` Nên xuất trước các ngành: ${stale.byCategory.slice(0, 4).map((c) => c.category).join(", ")}.` : ""}`,
        href: "/admin",
        action: "Nhập CSV",
      });
    }
  }
  if (stale.total)
    items.push({
      key: "stale-price",
      level: stale.total >= 20 ? "normal" : "low",
      count: stale.total,
      title: `${stale.total} món khách đang quan tâm có giá đã cũ (quá ${STALE_PRICE_DAYS()} ngày)`,
      why: `Nhiều nhất ở ${stale.byCategory.slice(0, 3).map((c) => `${c.category} (${c.n})`).join(", ")}. Nhập CSV mới các ngành này, hoặc để tiện ích “Cập nhật ảnh & giá hàng loạt” tự mở lại từng món.`,
      href: "/admin/san-pham",
      action: "Xem cách cập nhật",
    });
  if (noImage) items.push({ key: "no-image", level: noImage > 50 ? "normal" : "low", count: noImage, title: `${noImage} món đang bán chưa có ảnh`, why: "Thẻ deal kém hấp dẫn và trang có thể chưa được Google index.", href: "/admin/san-pham?loc=no_image", action: "Lấy ảnh" });
  if (noCat) items.push({ key: "no-cat", level: "low", count: noCat, title: `${noCat} món đang bán chưa có danh mục`, why: "Không vào được trang danh mục. Bấm “Tự xếp danh mục ngay” hoặc gán hàng loạt.", href: "/admin/san-pham?dm=__none", action: "Xếp danh mục" });

  // --- Thấp ---
  const auto = catSrc.auto + catSrc.ai;
  if (auto >= 20) items.push({ key: "auto-cat", level: "low", count: auto, title: `${auto} món được tự xếp danh mục – nên xem lại vài món`, why: "Kiểm tra nhanh xem máy xếp có nhầm nhóm nào không.", href: "/admin/san-pham?dm=__auto", action: "Xem lại" });
  if (bare) items.push({ key: "thin", level: "low", count: bare, title: `${bare} trang sản phẩm chưa được Google index`, why: "Vắng trên sàn quá lâu hoặc chưa đủ dữ liệu (ảnh, lịch sử giá).", href: "/admin/tim-kiem", action: "Xem lý do" });

  const order: Record<TodoLevel, number> = { high: 0, normal: 1, low: 2 };
  return items.sort((a, b) => order[a.level] - order[b.level]);
}

export interface DayStats {
  views: number;
  clicks: number;
  searches: number;
  zeroSearches: number;
  orders: number;
  commission: number;
}

/** Số liệu 1 ngày (giờ Việt Nam). offset 0 = hôm nay tới giờ, -1 = hôm qua */
export async function dayStats(now = new Date(), offset = -1): Promise<DayStats> {
  await ensureMigrated();
  const from = vnDayStart(now, offset);
  const to = offset === 0 ? now : vnDayStart(now, offset + 1);
  const dayKey = new Date(from.getTime() + TZ_MS).toISOString().slice(0, 10);
  const [[v], [c], [s], [o]] = await Promise.all([
    db.select({ n: count() }).from(productViews).where(eq(productViews.day, dayKey)),
    db.select({ n: count() }).from(clicks).where(and(gte(clicks.createdAt, from), lt(clicks.createdAt, to))),
    db
      .select({ n: count(), zero: sql<number>`count(*) filter (where ${searchLog.results} = 0)` })
      .from(searchLog)
      .where(and(gte(searchLog.createdAt, from), lt(searchLog.createdAt, to))),
    db
      .select({ orders: sql<number>`count(distinct ${conversionItems.orderId})`, comm: sql<number>`coalesce(sum(${conversionItems.commission}), 0)` })
      .from(conversionItems)
      .where(and(gte(conversionItems.purchasedAt, from), lt(conversionItems.purchasedAt, to), sql`${conversionItems.status} <> 'cancelled'`)),
  ]);
  return { views: Number(v.n), clicks: Number(c.n), searches: Number(s.n), zeroSearches: Number(s.zero), orders: Number(o.orders), commission: Number(o.comm) };
}

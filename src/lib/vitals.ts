/**
 * Tốc độ tải trang đo trên máy người dùng thật (Core Web Vitals), không phải đo thử trong phòng thí nghiệm.
 * Trình duyệt gửi số đo khi người dùng rời/ẩn trang (/api/vitals); ở đây làm sạch, xếp loại theo ngưỡng của Google
 * và tổng hợp p75 (75% lượt xem nhanh hơn mức này – đúng cách Google chấm điểm trong Search Console).
 */
import { and, gte, lt, sql } from "drizzle-orm";
import { webVitals } from "@/db/schema";
import { db, ensureMigrated } from "./db";

export const METRICS = ["LCP", "INP", "CLS", "FCP", "TTFB"] as const;
export type Metric = (typeof METRICS)[number];

/** Ngưỡng của Google: ≤ tốt, ≤ cần cải thiện, còn lại kém. Thời gian tính bằng ms, CLS không có đơn vị */
export const THRESHOLDS: Record<Metric, [number, number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
};

export const METRIC_INFO: Record<Metric, { name: string; what: string; core: boolean }> = {
  LCP: { name: "Hiện nội dung chính", what: "Thời gian tới khi ảnh hoặc khối chữ lớn nhất hiện ra", core: true },
  INP: { name: "Phản hồi khi bấm", what: "Độ trễ từ lúc bấm/chạm tới khi trang phản hồi (lượt chậm nhất)", core: true },
  CLS: { name: "Độ xô lệch bố cục", what: "Mức nội dung bị nhảy chỗ khi đang tải", core: true },
  FCP: { name: "Hiện chữ đầu tiên", what: "Thời gian tới khi có nội dung đầu tiên trên màn hình", core: false },
  TTFB: { name: "Máy chủ phản hồi", what: "Thời gian tới byte đầu tiên từ máy chủ", core: false },
};

export type Rating = "good" | "needs-improvement" | "poor";
export const rate = (m: Metric, v: number): Rating => (v <= THRESHOLDS[m][0] ? "good" : v <= THRESHOLDS[m][1] ? "needs-improvement" : "poor");

/** Hiển thị: 2,4 s · 180 ms · 0,05 */
export function fmtMetric(m: Metric, v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "–";
  if (m === "CLS") return v.toFixed(2).replace(".", ",");
  return v >= 1000 ? `${(v / 1000).toFixed(1).replace(".", ",")} s` : `${Math.round(v)} ms`;
}

/** Loại trang theo đường dẫn (để biết nhóm trang nào chậm) */
const PAGE_TYPES: [RegExp, string][] = [
  [/^\/$/, "Trang chủ"],
  [/^\/product\//, "Sản phẩm"],
  [/^\/danh-muc\//, "Danh mục"],
  [/^\/(search|tim-kiem)/, "Tìm kiếm"],
  [/^\/gia(\/|$)/, "Giá hôm nay"],
  [/^\/(sale|nang-gia|lich-sale)(\/|$)/, "Đợt sale"],
  [/^\/(huong-dan|bao-cao-gia)(\/|$)/, "Bài viết"],
  [/^\/(so-sanh|shop|top|bo-suu-tap|ds|deal-hom-nay)(\/|$)/, "Danh sách deal"],
  [/^\/(vouchers|tinh-gia|kiem-tra-gia|tim-bang-anh)(\/|$)/, "Công cụ"],
];
export function pageType(path: string): string | null {
  if (/^\/(admin|api|reel|go|p)\//.test(path) || path === "/admin") return null;
  return PAGE_TYPES.find(([re]) => re.test(path))?.[1] ?? "Khác";
}

export interface VitalInput {
  name?: unknown;
  value?: unknown;
  path?: unknown;
  device?: unknown;
  net?: unknown;
}

/** Làm sạch 1 số đo; null nếu không hợp lệ hoặc là trang không cần đo */
export function cleanVital(v: VitalInput) {
  const metric = String(v?.name ?? "") as Metric;
  if (!METRICS.includes(metric)) return null;
  const value = Number(v?.value);
  // Giới hạn hợp lý: thời gian ≤ 60 s, CLS ≤ 10 (số lớn hơn là lỗi đo hoặc dữ liệu giả)
  if (!Number.isFinite(value) || value < 0 || value > (metric === "CLS" ? 10 : 60_000)) return null;
  let path = String(v?.path ?? "").split(/[?#]/)[0].slice(0, 200);
  if (!path.startsWith("/")) return null;
  try {
    path = decodeURIComponent(path);
  } catch {
    /* giữ nguyên */
  }
  const page = pageType(path);
  if (!page) return null;
  const device = v?.device === "mobile" ? "mobile" : "desktop";
  const net = typeof v?.net === "string" && /^(slow-2g|2g|3g|4g)$/.test(v.net) ? v.net : null;
  return { metric, value: metric === "CLS" ? Math.round(value * 1000) / 1000 : Math.round(value), rating: rate(metric, value), page, path, device, net };
}

const BOT_UA = /bot|crawl|spider|slurp|lighthouse|pagespeed|headless|preview|facebookexternalhit|zalo.*bot/i;
export const isBotUa = (ua: string | null) => !ua || BOT_UA.test(ua);

export async function recordVitals(list: VitalInput[], now = new Date()): Promise<number> {
  await ensureMigrated();
  const rows = list.slice(0, 10).map(cleanVital).filter((x): x is NonNullable<ReturnType<typeof cleanVital>> => !!x);
  if (!rows.length) return 0;
  await db.insert(webVitals).values(rows.map((r) => ({ ...r, createdAt: now })));
  return rows.length;
}

export async function pruneVitals(now = new Date(), keepDays = 60) {
  await ensureMigrated();
  await db.delete(webVitals).where(lt(webVitals.createdAt, new Date(now.getTime() - keepDays * 86_400_000)));
}

export interface MetricSummary {
  metric: Metric;
  n: number;
  p75: number | null;
  good: number; // % lượt tốt
  poor: number; // % lượt kém
}

const p75Sql = sql<number>`percentile_cont(0.75) within group (order by ${webVitals.value})`;
const goodSql = sql<number>`count(*) filter (where ${webVitals.rating} = 'good')`;
const poorSql = sql<number>`count(*) filter (where ${webVitals.rating} = 'poor')`;

/** Báo cáo cho trang quản trị */
export async function vitalsReport(days = 28, now = new Date()) {
  await ensureMigrated();
  const since = new Date(now.getTime() - days * 86_400_000);
  const prevSince = new Date(since.getTime() - days * 86_400_000);
  const inRange = (a: Date, b: Date) => and(gte(webVitals.createdAt, a), lt(webVitals.createdAt, b));
  const tz = sql.raw(`'Asia/Ho_Chi_Minh'`);
  const day = sql<string>`to_char(${webVitals.createdAt} at time zone ${tz}, 'YYYY-MM-DD')`;

  const [overall, prev, byPage, daily, slowPaths, views] = await Promise.all([
    db.select({ metric: webVitals.metric, device: webVitals.device, n: sql<number>`count(*)`, p75: p75Sql, good: goodSql, poor: poorSql }).from(webVitals).where(inRange(since, now)).groupBy(webVitals.metric, webVitals.device),
    db.select({ metric: webVitals.metric, device: webVitals.device, p75: p75Sql }).from(webVitals).where(inRange(prevSince, since)).groupBy(webVitals.metric, webVitals.device),
    db
      .select({ page: webVitals.page, metric: webVitals.metric, device: webVitals.device, n: sql<number>`count(*)`, p75: p75Sql })
      .from(webVitals)
      .where(inRange(since, now))
      .groupBy(webVitals.page, webVitals.metric, webVitals.device),
    db.select({ day, metric: webVitals.metric, p75: p75Sql }).from(webVitals).where(and(inRange(since, now), sql`${webVitals.device} = 'mobile'`)).groupBy(day, webVitals.metric),
    db
      .select({ path: webVitals.path, page: webVitals.page, n: sql<number>`count(*)`, p75: p75Sql })
      .from(webVitals)
      .where(and(inRange(since, now), sql`${webVitals.metric} = 'LCP'`))
      .groupBy(webVitals.path, webVitals.page)
      // Chỉ trang có p75 vượt ngưỡng "tốt" (2,5 s) – danh sách việc cần sửa, không liệt kê trang đã nhanh
      .having(sql`count(*) >= 3 and percentile_cont(0.75) within group (order by ${webVitals.value}) > ${THRESHOLDS.LCP[0]}`)
      .orderBy(sql`percentile_cont(0.75) within group (order by ${webVitals.value}) desc`)
      .limit(10),
    // Số lượt xem có đo: đếm theo số đo TTFB (mỗi lượt tải trang gửi đúng 1)
    db.select({ device: webVitals.device, n: sql<number>`count(*)` }).from(webVitals).where(and(inRange(since, now), sql`${webVitals.metric} = 'TTFB'`)).groupBy(webVitals.device),
  ]);

  const summarize = (device: "mobile" | "desktop"): MetricSummary[] =>
    METRICS.map((m) => {
      const r = overall.find((x) => x.metric === m && x.device === device);
      const n = Number(r?.n ?? 0);
      return { metric: m, n, p75: r && n ? Number(r.p75) : null, good: n ? (Number(r!.good) / n) * 100 : 0, poor: n ? (Number(r!.poor) / n) * 100 : 0 };
    });
  const prevP75 = (m: Metric, device: string) => {
    const r = prev.find((x) => x.metric === m && x.device === device);
    return r ? Number(r.p75) : null;
  };

  // Bảng theo loại trang (điện thoại trước – Google chấm điểm điện thoại riêng)
  const pages = [...new Set(byPage.map((r) => r.page))]
    .map((page) => {
      const cell = (m: Metric, device: string) => {
        const r = byPage.find((x) => x.page === page && x.metric === m && x.device === device);
        return r ? { p75: Number(r.p75), n: Number(r.n) } : null;
      };
      return {
        page,
        mobile: { LCP: cell("LCP", "mobile"), INP: cell("INP", "mobile"), CLS: cell("CLS", "mobile"), TTFB: cell("TTFB", "mobile") },
        desktop: { LCP: cell("LCP", "desktop"), INP: cell("INP", "desktop"), CLS: cell("CLS", "desktop"), TTFB: cell("TTFB", "desktop") },
        views: (cell("TTFB", "mobile")?.n ?? 0) + (cell("TTFB", "desktop")?.n ?? 0),
      };
    })
    .sort((a, b) => b.views - a.views);

  const days_: string[] = [];
  for (let i = days - 1; i >= 0; i--) days_.push(new Date(now.getTime() + 7 * 3_600_000 - i * 86_400_000).toISOString().slice(0, 10));
  const trend = (m: Metric) => days_.map((d) => {
    const r = daily.find((x) => x.day === d && x.metric === m);
    return r ? Number(r.p75) : null;
  });

  return {
    days,
    mobile: summarize("mobile"),
    desktop: summarize("desktop"),
    prevP75,
    pages,
    trend: { days: days_, LCP: trend("LCP"), INP: trend("INP"), CLS: trend("CLS") },
    slowPaths: slowPaths.map((r) => ({ path: r.path, page: r.page, n: Number(r.n), p75: Number(r.p75) })),
    views: { mobile: Number(views.find((v) => v.device === "mobile")?.n ?? 0), desktop: Number(views.find((v) => v.device === "desktop")?.n ?? 0) },
  };
}
export type VitalsReport = Awaited<ReturnType<typeof vitalsReport>>;

/**
 * Đạt Core Web Vitals khi cả 3 chỉ số chính (LCP, INP, CLS) có p75 ở mức tốt – giống cách Google đánh giá.
 * Trả null khi chưa đủ số đo (< 20 lượt cho mỗi chỉ số).
 */
export function passes(list: MetricSummary[]): boolean | null {
  const core = list.filter((s) => METRIC_INFO[s.metric].core);
  if (core.some((s) => s.n < 20 || s.p75 == null)) return null;
  return core.every((s) => rate(s.metric, s.p75!) === "good");
}

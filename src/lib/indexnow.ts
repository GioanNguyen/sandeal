/**
 * Báo công cụ tìm kiếm có trang mới/đổi bằng IndexNow (Bing, Yandex, Naver, Seznam… – gửi 1 lần tới api.indexnow.org,
 * các bên tham gia tự chia sẻ cho nhau). Google KHÔNG dùng IndexNow: với Google, site dựa vào sitemap (lastmod theo lần đổi giá)
 * đã khai báo trong Google Search Console.
 *
 * Sau mỗi lần đồng bộ giá, gom: món mới thêm, món vừa đổi giá, bài hướng dẫn vừa đăng, trang mã giảm giá tháng mới,
 * trang thương hiệu có món đổi giá; các trang tổng hợp (trang chủ, deal hôm nay, mã giảm giá) gửi tối đa 1 lần/ngày.
 *
 * .env: INDEXNOW=0 để tắt · INDEXNOW_KEY (tuỳ chọn, mặc định tự sinh từ AUTH_SECRET). Tự tắt khi SITE_URL không phải
 * https công khai hoặc site đang khoá mật khẩu (công cụ tìm kiếm không vào được).
 */
import crypto from "node:crypto";
import { and, desc, gt, inArray, or, sql } from "drizzle-orm";
import { indexnowLog, pricePoints, products, vouchers } from "@/db/schema";
import { availableSql } from "./availability";
import { brandPath, detectBrand } from "./brands";
import { db, ensureMigrated } from "./db";
import { guidePublishAt } from "./guides";
import { livePublishedGuides } from "./guides-db";
import { siteUrl } from "./mail";
import { productPath } from "./slug";
import { productIndexableSql } from "./seoquality";
import { VOUCHER_PLATFORMS, currentMonthRef, monthRefs } from "./voucherpages";

const ENDPOINT = "https://api.indexnow.org/indexnow";
export const KEY_PATH = "/indexnow-key.txt";
const HOUR = 3_600_000;
/** Tối đa mỗi lần gửi (IndexNow cho tới 10.000; giữ thấp để không bị coi là gửi tràn lan) */
export const MAX_URLS = 2000;

export function indexNowKey(): string {
  const k = process.env.INDEXNOW_KEY?.trim();
  if (k && /^[a-zA-Z0-9-]{8,128}$/.test(k)) return k;
  return crypto.createHash("sha256").update(`${process.env.AUTH_SECRET || siteUrl()}:indexnow`).digest("hex").slice(0, 32);
}

/** Bật được không; nếu không thì vì sao (hiện trong trang quản trị) */
export function indexNowStatus(): { on: true } | { on: false; reason: string } {
  if (process.env.INDEXNOW === "0") return { on: false, reason: "Đã tắt bằng INDEXNOW=0" };
  let u: URL;
  try {
    u = new URL(siteUrl());
  } catch {
    return { on: false, reason: "SITE_URL không hợp lệ" };
  }
  if (u.protocol !== "https:" || /^(localhost|127\.|10\.|192\.168\.)/.test(u.hostname) || !u.hostname.includes(".")) return { on: false, reason: `SITE_URL (${u.host}) chưa phải địa chỉ https công khai` };
  if (process.env.BASIC_AUTH_USER && process.env.BASIC_AUTH_PASSWORD) return { on: false, reason: "Site đang khoá mật khẩu (BASIC_AUTH) nên công cụ tìm kiếm không vào được" };
  return { on: true };
}

/** Gửi danh sách đường dẫn đầy đủ, ghi lại kết quả. Trả về mã HTTP (0 = lỗi mạng) */
export async function submitUrls(urls: string[], opts: { hubs?: boolean; fetchImpl?: typeof fetch; now?: Date } = {}): Promise<number> {
  await ensureMigrated();
  const site = siteUrl();
  const host = new URL(site).host;
  const list = [...new Set(urls)].filter((u) => u.startsWith(site)).slice(0, MAX_URLS);
  if (!list.length) return 200;
  let status = 0;
  let error: string | null = null;
  try {
    const res = await (opts.fetchImpl ?? fetch)(ENDPOINT, {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key: indexNowKey(), keyLocation: `${site}${KEY_PATH}`, urlList: list }),
    });
    status = res.status;
    if (status !== 200 && status !== 202) {
      const why: Record<number, string> = { 400: "sai định dạng", 403: "khoá không hợp lệ (tệp khoá không truy cập được?)", 422: "đường dẫn không thuộc site hoặc sai khoá", 429: "gửi quá nhiều, bị giới hạn" };
      error = `${why[status] ?? "lỗi"}: ${(await res.text().catch(() => "")).slice(0, 200)}`;
    }
  } catch (err) {
    error = (err as Error).message.slice(0, 300);
  }
  await db.insert(indexnowLog).values({ at: opts.now ?? new Date(), urls: list.length, status, error, sample: list.slice(0, 8), hubs: !!opts.hubs });
  return status;
}

/** Lần gửi thành công gần nhất (và lần gần nhất có gửi trang tổng hợp) */
async function lastSuccess() {
  const ok = or(sql`${indexnowLog.status} = 200`, sql`${indexnowLog.status} = 202`);
  const [last] = await db.select({ at: indexnowLog.at }).from(indexnowLog).where(ok).orderBy(desc(indexnowLog.at)).limit(1);
  const [hub] = await db.select({ at: indexnowLog.at }).from(indexnowLog).where(and(ok, sql`${indexnowLog.hubs}`)).orderBy(desc(indexnowLog.at)).limit(1);
  return { last: last?.at ?? null, hub: hub?.at ?? null };
}

/** Các trang mới/đổi kể từ `since` */
export async function changedUrls(since: Date, now = new Date(), withHubs = false): Promise<string[]> {
  await ensureMigrated();
  const site = siteUrl();
  const out: string[] = [];
  // Món mới thêm hoặc vừa đổi giá (còn bán), deal tốt trước
  const changed = db.select({ id: pricePoints.productId }).from(pricePoints).where(gt(pricePoints.capturedAt, since));
  const rows = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(and(availableSql(), productIndexableSql(now), or(gt(products.createdAt, since), inArray(products.id, changed))))
    .orderBy(desc(products.dealScore))
    .limit(MAX_URLS - 100);
  for (const p of rows) out.push(`${site}${productPath(p)}`);
  // Trang thương hiệu của các món đó
  const brands = new Set<string>();
  for (const p of rows) {
    const b = detectBrand(p.name);
    if (b) brands.add(brandPath(b));
  }
  for (const b of [...brands].slice(0, 60)) out.push(`${site}${b}`);
  // Bài hướng dẫn vừa tới giờ đăng
  for (const g of await livePublishedGuides(now)) {
    const t = guidePublishAt(g).getTime();
    if (t > since.getTime() && t <= now.getTime()) out.push(`${site}/huong-dan/${g.slug}`);
  }
  // Trang mã giảm giá tháng: sang tháng mới, hoặc sàn có mã mới/đổi
  const newMonth = monthRefs(since).find((r) => r.state === "current")?.m !== monthRefs(now).find((r) => r.state === "current")?.m;
  const vRows = await db.select({ platform: vouchers.platform }).from(vouchers).where(gt(vouchers.updatedAt, since)).groupBy(vouchers.platform);
  for (const p of VOUCHER_PLATFORMS) if (newMonth || vRows.some((v) => v.platform === p)) out.push(`${site}/ma-giam-gia/${currentMonthRef(p, now).slug}`);
  if (newMonth) for (const r of monthRefs(now).filter((x) => x.state === "next")) out.push(`${site}/ma-giam-gia/${r.slug}`);
  // Trang tổng hợp (đổi liên tục): tối đa 1 lần/ngày
  if (withHubs) out.push(...["/", "/deal-hom-nay", "/vouchers", "/ma-giam-gia", "/thuong-hieu", "/huong-dan", "/gia", "/giam-gia-ao"].map((p) => `${site}${p}`));
  return [...new Set(out)];
}

/** Việc định kỳ (sau mỗi lần đồng bộ): gom trang mới/đổi từ lần gửi thành công trước rồi gửi 1 lô */
export async function runIndexNow(now = new Date(), fetchImpl?: typeof fetch): Promise<{ sent: number; status: number | null; skipped?: string }> {
  const st = indexNowStatus();
  if (!st.on) return { sent: 0, status: null, skipped: st.reason };
  await ensureMigrated();
  const { last, hub } = await lastSuccess();
  // Lần đầu: chỉ gửi những gì đổi trong 24 giờ qua (không đẩy cả kho cũ)
  const since = last ?? new Date(now.getTime() - 24 * HOUR);
  const withHubs = !hub || now.getTime() - hub.getTime() >= 20 * HOUR;
  const urls = await changedUrls(since, now, withHubs);
  if (!urls.length) return { sent: 0, status: null };
  const status = await submitUrls(urls, { hubs: withHubs, fetchImpl, now });
  return { sent: Math.min(urls.length, MAX_URLS), status };
}

export async function indexNowHistory(limit = 15) {
  await ensureMigrated();
  return db.select().from(indexnowLog).orderBy(desc(indexnowLog.at)).limit(limit);
}

/** Xoá lịch sử quá 90 ngày */
export async function pruneIndexNow(now = new Date()) {
  await ensureMigrated();
  await db.delete(indexnowLog).where(sql`${indexnowLog.at} < ${new Date(now.getTime() - 90 * 24 * HOUR)}`);
}

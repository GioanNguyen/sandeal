/**
 * Trang "Mã giảm giá [sàn] tháng N/YYYY" (/ma-giam-gia/shopee-thang-10-2026).
 * Tháng hiện tại: mã đang còn hạn + lịch sale trong tháng. Tháng đã qua: lưu lại các mã từng có (để tham khảo mức giảm).
 * Tháng sau (từ ngày 20): lịch sale sắp tới + mã đã được phát hành sớm. Mọi con số tính từ mã Săn Deal thu thập được.
 */
import { and, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { vouchers, type Voucher } from "@/db/schema";
import { db, ensureMigrated } from "./db";
import { PLATFORMS } from "./format";
import { salesBetween, vnParts, type SaleEvent } from "./sales";

export const VOUCHER_PLATFORMS = ["shopee", "lazada", "tiktok"] as const;
export type VPlatform = (typeof VOUCHER_PLATFORMS)[number];
/** Đường dẫn dùng tên quen thuộc: tiktok-shop thay cho tiktok */
const SLUG_NAME: Record<VPlatform, string> = { shopee: "shopee", lazada: "lazada", tiktok: "tiktok-shop" };

export interface MonthRef {
  platform: VPlatform;
  y: number;
  m: number;
  slug: string;
  /** current | past | next */
  state: "current" | "past" | "next";
}

const VN = 7 * 3_600_000;
export const monthStart = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1) - VN);
const addMonth = (y: number, m: number, k: number) => ({ y: y + Math.floor((m - 1 + k) / 12), m: (((m - 1 + k) % 12) + 12) % 12 + 1 });

export const monthSlug = (platform: VPlatform, y: number, m: number) => `${SLUG_NAME[platform]}-thang-${m}-${y}`;
export const platformLabel = (p: string) => PLATFORMS[p]?.label ?? p;

/** Các tháng có trang: 3 tháng trước, tháng này và (từ ngày 20) tháng sau */
export function monthRefs(now = new Date()): MonthRef[] {
  const { y, m, d } = { ...vnParts(now), d: new Date(now.getTime() + VN).getUTCDate() };
  const out: MonthRef[] = [];
  for (const platform of VOUCHER_PLATFORMS) {
    for (let k = -3; k <= 1; k++) {
      if (k === 1 && d < 20) continue;
      const t = addMonth(y, m, k);
      out.push({ platform, y: t.y, m: t.m, slug: monthSlug(platform, t.y, t.m), state: k < 0 ? "past" : k === 0 ? "current" : "next" });
    }
  }
  return out;
}

export function parseMonthSlug(slug: string, now = new Date()): MonthRef | null {
  return monthRefs(now).find((r) => r.slug === slug) ?? null;
}

/** Trang tháng hiện tại của 1 sàn (để chuyển hướng /ma-giam-gia/shopee) */
export const currentMonthRef = (platform: VPlatform, now = new Date()) => monthRefs(now).find((r) => r.platform === platform && r.state === "current")!;

export type VoucherKind = "freeship" | "percent" | "fixed" | "cashback" | "other";
export function voucherKind(v: Pick<Voucher, "discountType" | "title" | "discountText">): VoucherKind {
  if (v.discountType === "freeship" || /free\s?ship|miễn phí vận chuyển/i.test(`${v.title} ${v.discountText ?? ""}`)) return "freeship";
  if (v.discountType === "cashback" || /hoàn xu|hoàn tiền|cashback/i.test(`${v.title} ${v.discountText ?? ""}`)) return "cashback";
  if (v.discountType === "percent") return "percent";
  if (v.discountType === "fixed") return "fixed";
  return "other";
}
export const KIND_LABEL: Record<VoucherKind, string> = { freeship: "Miễn phí vận chuyển", percent: "Giảm theo %", fixed: "Giảm số tiền", cashback: "Hoàn xu, hoàn tiền", other: "Ưu đãi khác" };

/** Số tiền giảm tối đa của 1 mã (để tìm mã "mạnh" nhất): mã cố định = giá trị, mã % = mức tối đa */
export const voucherMaxValue = (v: Pick<Voucher, "discountType" | "discountValue" | "maxDiscount">) =>
  v.discountType === "fixed" ? v.discountValue ?? 0 : v.discountType === "percent" ? v.maxDiscount ?? 0 : 0;

export interface MonthReport {
  ref: MonthRef;
  /** Mã có hiệu lực (một phần) trong tháng; tháng này: chỉ mã còn hạn, xếp sắp hết hạn trước */
  list: Voucher[];
  /** Tháng này: mã đã hết hạn trong tháng (để biết sàn đã phát những mã gì) */
  expired: Voucher[];
  byKind: { kind: VoucherKind; n: number }[];
  /** Mã giảm nhiều tiền nhất (theo mức tối đa) */
  strongest: Voucher | null;
  /** Mã không cần đơn tối thiểu */
  noMin: number;
  sales: SaleEvent[];
  /** Tháng hiện tại: các đợt sale còn lại */
  upcoming: SaleEvent[];
}

export async function monthReport(ref: MonthRef, now = new Date()): Promise<MonthReport> {
  await ensureMigrated();
  const start = monthStart(ref.y, ref.m);
  const n = addMonth(ref.y, ref.m, 1);
  const end = monthStart(n.y, n.m);
  // Có hiệu lực (một phần) trong tháng. Mã không ghi ngày nào: tính vào tháng nó được cập nhật
  const overlap = and(
    eq(vouchers.platform, ref.platform),
    or(
      and(isNull(vouchers.startAt), isNull(vouchers.endAt), gte(vouchers.updatedAt, start), lt(vouchers.updatedAt, end)),
      and(
        sql`not (${vouchers.startAt} is null and ${vouchers.endAt} is null)`,
        or(isNull(vouchers.startAt), lt(vouchers.startAt, end)),
        or(isNull(vouchers.endAt), gte(vouchers.endAt, start)),
      ),
    ),
  );
  const rows = await db.select().from(vouchers).where(overlap).orderBy(desc(vouchers.updatedAt)).limit(400);
  const live = (v: Voucher) => !v.endAt || v.endAt >= now;
  const list =
    ref.state === "past"
      ? rows
      : rows.filter(live).sort((a, b) => (a.endAt?.getTime() ?? Infinity) - (b.endAt?.getTime() ?? Infinity));
  const expired = ref.state === "past" ? [] : rows.filter((v) => !live(v));
  const counts = new Map<VoucherKind, number>();
  for (const v of list) counts.set(voucherKind(v), (counts.get(voucherKind(v)) ?? 0) + 1);
  const byKind = [...counts.entries()].map(([kind, n]) => ({ kind, n })).sort((a, b) => b.n - a.n);
  const strongest = [...list].sort((a, b) => voucherMaxValue(b) - voucherMaxValue(a))[0] ?? null;
  const sales = salesBetween(start, new Date(end.getTime() - 1), false);
  return {
    ref,
    list,
    expired,
    byKind,
    strongest: strongest && voucherMaxValue(strongest) > 0 ? strongest : null,
    noMin: list.filter((v) => !v.minSpend).length,
    sales,
    upcoming: sales.filter((e) => e.end >= now),
  };
}


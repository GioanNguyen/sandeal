/**
 * Doanh thu (hoa hồng affiliate) chính xác hơn:
 *  1. Lưu TỪNG DÒNG sản phẩm trong đơn (bảng conversion_items) từ API báo cáo của sàn hoặc tệp CSV tải ở trang affiliate.
 *     Một đơn chỉ giữ dữ liệu của lần nhập gần nhất -> API và CSV không cộng trùng.
 *  2. Ghép từng dòng với món đang theo dõi (mã sản phẩm) và lượt bấm "Mua" trên site (kênh khách tới) -> biết món nào,
 *     danh mục nào, kênh nào thật sự ra tiền.
 *  3. Tách hoa hồng đã chốt / đang chờ / bị huỷ; ước tính thực nhận từ tỉ lệ huỷ thật của chính site.
 */
import { and, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { clicks, conversionItems, products } from "@/db/schema";
import { fold } from "./autocategory";
import { db, ensureMigrated } from "./db";
import { parseCsv } from "./shopee-csv";

const DAY = 86_400_000;
const MIN = 60_000;
/** Sàn ghi nhận đơn trong ~7 ngày sau lượt bấm */
export const ATTRIBUTION_DAYS = 7;
/** Tỉ lệ huỷ mặc định khi chưa đủ đơn đã chốt để tính */
export const DEFAULT_CANCEL_RATE = 0.15;
export const MIN_SETTLED = 20;

import { lineStatus, type LineStatus } from "./convstatus";
export { lineStatus, type LineStatus };

export interface ConversionLine {
  lineKey: string;
  itemId?: string | null;
  itemName?: string | null;
  shopId?: string | null;
  price: number;
  qty: number;
  commission: number;
  status: LineStatus;
  purchasedAt: Date;
  completedAt?: Date | null;
  clickedAt?: Date | null;
  subIds?: string | null;
}

export interface ConversionOrder {
  platform: string;
  orderId: string;
  lines: ConversionLine[];
}

/** Thay toàn bộ dòng của từng đơn bằng dữ liệu mới (giữ phần đã ghép nếu dòng không đổi) */
export async function saveOrders(source: string, orders: ConversionOrder[], now = new Date()) {
  await ensureMigrated();
  let lines = 0;
  for (const o of orders) {
    if (!o.orderId || !o.lines.length) continue;
    // Dữ liệu mới thô (không có mã sản phẩm) không ghi đè dữ liệu chi tiết đã có (vd API cơ bản sau khi đã nhập CSV)
    if (o.lines.every((l) => !l.itemId)) {
      const [detailed] = await db.select({ id: conversionItems.id }).from(conversionItems).where(and(eq(conversionItems.platform, o.platform), eq(conversionItems.orderId, o.orderId), sql`${conversionItems.itemId} is not null`)).limit(1);
      if (detailed) continue;
    }
    await db.transaction(async (tx) => {
      await tx.delete(conversionItems).where(and(eq(conversionItems.platform, o.platform), eq(conversionItems.orderId, o.orderId)));
      const seen = new Map<string, number>();
      for (const l of o.lines) {
        // Cùng mã dòng xuất hiện 2 lần (cùng món 2 phân loại không có mã phân loại): đánh số thêm
        const n = (seen.get(l.lineKey) ?? 0) + 1;
        seen.set(l.lineKey, n);
        await tx.insert(conversionItems).values({
          source,
          platform: o.platform,
          orderId: o.orderId,
          lineKey: n > 1 ? `${l.lineKey}#${n}` : l.lineKey,
          itemId: l.itemId ?? null,
          itemName: l.itemName?.slice(0, 300) ?? null,
          shopId: l.shopId ?? null,
          price: l.price,
          qty: Math.max(1, Math.round(l.qty || 1)),
          commission: l.commission,
          status: l.status,
          purchasedAt: l.purchasedAt,
          completedAt: l.completedAt ?? null,
          clickedAt: l.clickedAt ?? null,
          subIds: l.subIds ?? null,
          importedAt: now,
        });
        lines++;
      }
    });
  }
  return lines;
}

// ---------- Ghép với món và lượt bấm ----------

/** Mã lượt bấm do site gắn vào sub_id (dạng c12345) – nếu có thì ghép chính xác tuyệt đối */
export const clickIdFromSubIds = (s: string | null | undefined) => {
  const m = (s ?? "").match(/(?:^|[-_,;| ])c(\d{1,12})(?=$|[-_,;| ])/);
  return m ? Number(m[1]) : null;
};

/**
 * Ghép các dòng chưa ghép (hoặc mới nhập trong `recheckDays` ngày): món theo mã sản phẩm, lượt bấm theo thời gian.
 *  - exact: có lượt bấm "Mua" đúng món này trong 7 ngày trước khi đặt (hoặc trùng giờ bấm sàn ghi lại)
 *  - cart: không bấm món này nhưng có bấm món/mã khác cùng sàn -> khách vào sàn qua link của site rồi mua thêm
 *  - none: không tìm được lượt bấm (bấm từ link đăng ở nơi khác, hoặc quá 7 ngày)
 */
export async function attributeLines(opts: { recheckDays?: number; now?: Date } = {}) {
  await ensureMigrated();
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - (opts.recheckDays ?? 3) * DAY);
  const todo = await db
    .select()
    .from(conversionItems)
    .where(or(isNull(conversionItems.attribution), gte(conversionItems.importedAt, since)))
    .limit(5000);
  if (!todo.length) return { matched: 0, total: 0 };

  // Món theo mã sản phẩm của sàn
  const ids = [...new Set(todo.map((t) => t.itemId).filter((x): x is string => !!x))];
  const prodRows = ids.length
    ? await db.select({ id: products.id, platform: products.platform, externalId: products.externalId }).from(products).where(inArray(products.externalId, ids))
    : [];
  const prodBy = new Map(prodRows.map((p) => [`${p.platform}:${p.externalId}`, p.id]));

  let matched = 0;
  for (const t of todo) {
    const productId = t.itemId ? prodBy.get(`${t.platform}:${t.itemId}`) ?? null : null;
    let click: { id: number; channel: string | null } | null = null;
    let attribution: "exact" | "cart" | "none" = "none";
    const direct = clickIdFromSubIds(t.subIds);
    if (direct) {
      const [c] = await db.select({ id: clicks.id, channel: clicks.channel, productId: clicks.productId }).from(clicks).where(eq(clicks.id, direct)).limit(1);
      if (c) {
        click = c;
        attribution = c.productId && c.productId === productId ? "exact" : "cart";
      }
    }
    if (!click) {
      // Mốc: giờ bấm sàn ghi lại (CSV có) hoặc giờ đặt hàng
      const at = t.clickedAt ?? t.purchasedAt;
      const win = and(lte(clicks.createdAt, new Date(at.getTime() + 10 * MIN)), gte(clicks.createdAt, new Date(at.getTime() - ATTRIBUTION_DAYS * DAY)));
      if (productId) {
        const [c] = await db.select({ id: clicks.id, channel: clicks.channel }).from(clicks).where(and(eq(clicks.productId, productId), win)).orderBy(desc(clicks.createdAt)).limit(1);
        if (c) {
          click = c;
          attribution = "exact";
        }
      }
      if (!click) {
        const [c] = await db.select({ id: clicks.id, channel: clicks.channel }).from(clicks).where(and(eq(clicks.platform, t.platform), win)).orderBy(desc(clicks.createdAt)).limit(1);
        if (c) {
          click = c;
          attribution = "cart";
        }
      }
    }
    if (click) matched++;
    await db
      .update(conversionItems)
      .set({ productId, clickId: click?.id ?? null, channel: click ? click.channel ?? "direct" : null, attribution })
      .where(eq(conversionItems.id, t.id));
  }
  return { matched, total: todo.length };
}

// ---------- Nhập CSV báo cáo hoa hồng ----------

/** Số tiền: "12.345" / "12,345" / "12345.5" / "₫1.234.567" */
export function parseMoney(raw: string | undefined | null): number {
  let s = (raw ?? "").replace(/[₫\s]|vnd|đ/gi, "").trim();
  if (!s || s === "-") return 0;
  const neg = /^-|^\(.*\)$/.test(s);
  s = s.replace(/[()-]/g, "");
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, "");
  else if (s.includes(".") && s.includes(",")) {
    const dec = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    s = s.replace(dec === "." ? /,/g : /\./g, "").replace(",", ".");
  } else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
}

/** Ngày giờ: "2026-10-01 12:34:56", "01/10/2026 12:34", "1/10/2026" – giờ Việt Nam */
export function parseVnDate(raw: string | undefined | null): Date | null {
  const s = (raw ?? "").trim();
  if (!s || s === "-" || s === "--") return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  let y: number, mo: number, d: number, h = 0, mi = 0, se = 0;
  if (m) [y, mo, d, h, mi, se] = [+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)];
  else {
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) {
      const t = Date.parse(s);
      return Number.isFinite(t) ? new Date(t) : null;
    }
    [d, mo, y, h, mi, se] = [+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)];
  }
  const t = Date.UTC(y, mo - 1, d, h - 7, mi, se);
  return Number.isFinite(t) && mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? new Date(t) : null;
}

type Field =
  | "orderId" | "checkoutId" | "orderStatus" | "itemStatus" | "purchasedAt" | "completedAt" | "clickedAt"
  | "itemId" | "modelId" | "itemName" | "shopId" | "price" | "qty" | "itemCommission" | "netCommission" | "orderCommission" | "subId";

// Tên cột đã bỏ dấu, chữ thường (khớp "bằng" hoặc "bắt đầu bằng"). Thứ tự = ưu tiên.
const HEADERS: Record<Field, string[]> = {
  orderId: ["id don hang", "ma don hang", "order id", "orderid", "order sn"],
  checkoutId: ["id checkout", "checkout id", "conversion id", "id chuyen doi"],
  orderStatus: ["trang thai dat hang", "trang thai don hang", "order status", "conversion status", "trang thai chuyen doi"],
  itemStatus: ["trang thai san pham lien ket", "trang thai san pham", "item status", "affiliate item status", "display item status"],
  purchasedAt: ["thoi gian dat hang", "ngay dat hang", "purchase time", "order time", "thoi gian mua"],
  completedAt: ["thoi gian hoan thanh", "ngay hoan thanh", "complete time", "completed time"],
  clickedAt: ["thoi gian click", "thoi gian nhan", "click time"],
  itemId: ["id san pham", "item id", "ma san pham", "id item"],
  modelId: ["id model", "model id", "id phan loai"],
  itemName: ["ten item", "ten san pham", "item name", "product name"],
  shopId: ["id shop", "shop id", "ma shop"],
  price: ["gia", "price", "item price", "don gia"],
  qty: ["so luong", "qty", "quantity"],
  itemCommission: ["tong hoa hong san pham", "item total commission", "hoa hong san pham", "tong hoa hong item"],
  netCommission: ["hoa hong rong tiep thi lien ket", "net affiliate commission", "hoa hong rong", "net commission"],
  orderCommission: ["tong hoa hong don hang", "order total commission", "total commission", "tong hoa hong"],
  subId: ["sub id", "sub_id", "subid"],
};

const normHeader = (h: string) => fold(h.replace(/\(.*?\)/g, " ")).trim();

export interface ConversionCsvResult {
  orders: ConversionOrder[];
  lines: number;
  skipped: { line: number; reason: string }[];
  /** Cột nhận ra được (để báo khi tệp khác định dạng) */
  columns: Partial<Record<Field, string>>;
  commissionColumn: "item" | "net" | "order" | null;
}

export function mapConversionCsv(text: string, platform = "shopee"): ConversionCsvResult {
  const rows = parseCsv(text);
  const empty: ConversionCsvResult = { orders: [], lines: 0, skipped: [], columns: {}, commissionColumn: null };
  if (rows.length < 2) return { ...empty, skipped: [{ line: 1, reason: "Tệp trống" }] };
  const head = rows[0].map(normHeader);
  const idx: Partial<Record<Field, number>> = {};
  const subIdx: number[] = [];
  head.forEach((h, i) => {
    if (HEADERS.subId.some((c) => h.replace(/[ _]/g, "").startsWith(c.replace(/[ _]/g, "")))) subIdx.push(i);
  });
  for (const f of Object.keys(HEADERS) as Field[]) {
    if (f === "subId") continue;
    for (const c of HEADERS[f]) {
      // "gia" chỉ khớp đúng tên cột (tránh "giá trị đơn hàng")
      const i = head.findIndex((h, j) => !Object.values(idx).includes(j) && (h === c || (c.length > 4 && h.startsWith(c))));
      if (i >= 0) {
        idx[f] = i;
        break;
      }
    }
  }
  const columns = Object.fromEntries(Object.entries(idx).map(([f, i]) => [f, rows[0][i as number]])) as Partial<Record<Field, string>>;
  if (idx.orderId == null && idx.checkoutId == null) return { ...empty, columns, skipped: [{ line: 1, reason: "Không thấy cột mã đơn hàng – có phải tệp báo cáo hoa hồng (Conversion report) không?" }] };
  if (idx.purchasedAt == null) return { ...empty, columns, skipped: [{ line: 1, reason: "Không thấy cột thời gian đặt hàng" }] };
  const commissionColumn = idx.itemCommission != null ? "item" : idx.netCommission != null ? "net" : idx.orderCommission != null ? "order" : null;
  if (!commissionColumn) return { ...empty, columns, skipped: [{ line: 1, reason: "Không thấy cột hoa hồng" }] };

  const get = (r: string[], f: Field) => (idx[f] != null ? (r[idx[f]!] ?? "").trim() : "");
  const byOrder = new Map<string, ConversionOrder>();
  const orderCommissionSeen = new Set<string>();
  const skipped: ConversionCsvResult["skipped"] = [];
  let lines = 0;
  rows.slice(1).forEach((r, i) => {
    const orderId = get(r, "orderId") || get(r, "checkoutId");
    const purchasedAt = parseVnDate(get(r, "purchasedAt"));
    if (!orderId) return skipped.push({ line: i + 2, reason: "Thiếu mã đơn" });
    if (!purchasedAt) return skipped.push({ line: i + 2, reason: "Thời gian đặt hàng không đọc được" });
    let commission: number;
    if (commissionColumn === "order") {
      // Hoa hồng cả đơn lặp lại ở mỗi dòng sản phẩm: chỉ tính 1 lần
      commission = orderCommissionSeen.has(orderId) ? 0 : parseMoney(get(r, "orderCommission"));
      orderCommissionSeen.add(orderId);
    } else commission = parseMoney(get(r, commissionColumn === "item" ? "itemCommission" : "netCommission"));
    const itemId = get(r, "itemId") || null;
    const modelId = get(r, "modelId");
    const status = lineStatus(get(r, "itemStatus") || get(r, "orderStatus"));
    const subIds = subIdx.map((j) => (r[j] ?? "").trim()).filter(Boolean).join("-") || null;
    const o = byOrder.get(orderId) ?? byOrder.set(orderId, { platform, orderId, lines: [] }).get(orderId)!;
    o.lines.push({
      lineKey: itemId ? `${itemId}${modelId ? `:${modelId}` : ""}` : `#${o.lines.length + 1}`,
      itemId,
      itemName: get(r, "itemName") || null,
      shopId: get(r, "shopId") || null,
      price: parseMoney(get(r, "price")),
      qty: Number(get(r, "qty").replace(/[^\d]/g, "")) || 1,
      commission,
      status,
      purchasedAt,
      completedAt: parseVnDate(get(r, "completedAt")),
      clickedAt: parseVnDate(get(r, "clickedAt")),
      subIds,
    });
    lines++;
  });
  return { orders: [...byOrder.values()], lines, skipped, columns, commissionColumn };
}

export async function importConversionCsv(text: string, now = new Date()) {
  const r = mapConversionCsv(text);
  const saved = await saveOrders("csv", r.orders, now);
  const att = saved ? await attributeLines({ now, recheckDays: 0.01 }) : { matched: 0, total: 0 };
  return { orders: r.orders.length, lines: saved, skipped: r.skipped.slice(0, 50), skippedCount: r.skipped.length, matched: att.matched, columns: r.columns, commissionColumn: r.commissionColumn };
}

// ---------- Báo cáo ----------

export interface RevenueTotals {
  orders: number;
  lines: number;
  amount: number;
  completed: number;
  pending: number;
  cancelled: number;
  cancelledOrders: number;
}

const sumBy = (status: LineStatus) => sql<number>`coalesce(sum(${conversionItems.commission}) filter (where ${conversionItems.status} = ${status}), 0)`;
const totalsCols = {
  orders: sql<number>`count(distinct ${conversionItems.orderId})::int`,
  lines: sql<number>`count(*)::int`,
  amount: sql<number>`coalesce(sum(${conversionItems.price} * ${conversionItems.qty}) filter (where ${conversionItems.status} <> 'cancelled'), 0)`,
  completed: sumBy("completed"),
  pending: sumBy("pending"),
  cancelled: sumBy("cancelled"),
  cancelledOrders: sql<number>`count(distinct ${conversionItems.orderId}) filter (where ${conversionItems.status} = 'cancelled')::int`,
};
const numify = <T extends Record<string, unknown>>(r: T) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v])) as T;

/**
 * Tỉ lệ huỷ thật của các đơn đã có kết quả trong 90 ngày, bỏ 14 ngày gần nhất (còn đang chờ).
 * Tính theo GIÁ TRỊ hàng (không theo hoa hồng: sàn có thể ghi hoa hồng = 0 cho dòng bị huỷ).
 * Chưa đủ MIN_SETTLED đơn thì dùng mặc định.
 */
export async function cancelRate(now = new Date()) {
  const amt = (status: LineStatus) => sql<number>`coalesce(sum(${conversionItems.price} * ${conversionItems.qty}) filter (where ${conversionItems.status} = ${status}), 0)`;
  const [r] = await db
    .select({ n: sql<number>`count(distinct ${conversionItems.orderId}) filter (where ${conversionItems.status} <> 'pending')::int`, done: amt("completed"), cancelled: amt("cancelled") })
    .from(conversionItems)
    .where(and(gte(conversionItems.purchasedAt, new Date(now.getTime() - 90 * DAY)), lt(conversionItems.purchasedAt, new Date(now.getTime() - 14 * DAY))));
  const n = Number(r?.n ?? 0);
  const done = Number(r?.done ?? 0);
  const cancelled = Number(r?.cancelled ?? 0);
  if (n < MIN_SETTLED || done + cancelled <= 0) return { rate: DEFAULT_CANCEL_RATE, fromData: false, settled: n };
  return { rate: cancelled / (done + cancelled), fromData: true, settled: n };
}

export interface RevenueReport {
  from: Date;
  to: Date;
  totals: RevenueTotals;
  /** Ước tính thực nhận = đã chốt + đang chờ × (1 − tỉ lệ huỷ) */
  expected: number;
  cancel: { rate: number; fromData: boolean; settled: number };
  clicks: number;
  daily: { day: string; completed: number; pending: number; cancelled: number }[];
  byChannel: { channel: string; clicks: number; orders: number; commission: number }[];
  byAttribution: { attribution: string; orders: number; commission: number }[];
  topProducts: { productId: number | null; itemId: string | null; name: string; orders: number; qty: number; commission: number; tracked: boolean }[];
  byCategory: { category: string; orders: number; commission: number; clicks: number }[];
  months: { month: string; orders: number; completed: number; pending: number; cancelled: number; completedInMonth: number }[];
  lastImport: { at: Date; source: string } | null;
}

// Múi giờ viết thẳng vào SQL (không dùng tham số) để SELECT và GROUP BY là cùng một biểu thức
const tz = sql.raw(`'Asia/Ho_Chi_Minh'`);
const okLine = sql`${conversionItems.status} <> 'cancelled'`;

export async function revenueReport(from: Date, to: Date, now = new Date()): Promise<RevenueReport> {
  await ensureMigrated();
  const inRange = and(gte(conversionItems.purchasedAt, from), lt(conversionItems.purchasedAt, to));
  const clickRange = and(gte(clicks.createdAt, from), lt(clicks.createdAt, to));
  const day = sql<string>`to_char(${conversionItems.purchasedAt} at time zone ${tz}, 'YYYY-MM-DD')`;
  const month = sql<string>`to_char(${conversionItems.purchasedAt} at time zone ${tz}, 'YYYY-MM')`;
  const doneMonth = sql<string>`to_char(${conversionItems.completedAt} at time zone ${tz}, 'YYYY-MM')`;
  const commOk = sql<number>`coalesce(sum(${conversionItems.commission}) filter (where ${okLine}), 0)`;
  const ordersOk = sql<number>`count(distinct ${conversionItems.orderId}) filter (where ${okLine})::int`;
  const chExpr = sql<string>`coalesce(${conversionItems.channel}, 'none')`;

  const [[totals], cancel, [{ n: clickCount }], daily, chOrders, chClicks, att, top, monthsRows, doneRows, [last]] = await Promise.all([
    db.select(totalsCols).from(conversionItems).where(inRange),
    cancelRate(now),
    db.select({ n: sql<number>`count(*)::int` }).from(clicks).where(clickRange),
    db.select({ day, completed: sumBy("completed"), pending: sumBy("pending"), cancelled: sumBy("cancelled") }).from(conversionItems).where(inRange).groupBy(day).orderBy(day),
    db.select({ channel: chExpr, orders: ordersOk, commission: commOk }).from(conversionItems).where(inRange).groupBy(chExpr),
    db.select({ channel: sql<string>`coalesce(${clicks.channel}, 'direct')`, n: sql<number>`count(*)::int` }).from(clicks).where(clickRange).groupBy(sql`coalesce(${clicks.channel}, 'direct')`),
    db.select({ attribution: sql<string>`coalesce(${conversionItems.attribution}, 'none')`, orders: ordersOk, commission: commOk }).from(conversionItems).where(inRange).groupBy(sql`coalesce(${conversionItems.attribution}, 'none')`),
    db
      .select({ productId: conversionItems.productId, itemId: conversionItems.itemId, name: sql<string>`max(${conversionItems.itemName})`, orders: ordersOk, qty: sql<number>`coalesce(sum(${conversionItems.qty}) filter (where ${okLine}), 0)::int`, commission: commOk })
      .from(conversionItems)
      .where(and(inRange, sql`${conversionItems.itemId} is not null`))
      .groupBy(conversionItems.productId, conversionItems.itemId)
      .orderBy(desc(commOk))
      .limit(15),
    db
      .select({ month, orders: sql<number>`count(distinct ${conversionItems.orderId})::int`, completed: sumBy("completed"), pending: sumBy("pending"), cancelled: sumBy("cancelled") })
      .from(conversionItems)
      .where(gte(conversionItems.purchasedAt, new Date(now.getTime() - 400 * DAY)))
      .groupBy(month)
      .orderBy(desc(month))
      .limit(12),
    db
      .select({ month: doneMonth, v: sumBy("completed") })
      .from(conversionItems)
      .where(and(sql`${conversionItems.completedAt} is not null`, gte(conversionItems.completedAt, new Date(now.getTime() - 400 * DAY))))
      .groupBy(doneMonth),
    db.select({ at: conversionItems.importedAt, source: conversionItems.source }).from(conversionItems).orderBy(desc(conversionItems.importedAt)).limit(1),
  ]);
  const t = numify(totals) as RevenueTotals;

  // Danh mục: ghép món đã nhận ra với danh mục hiện tại; lượt bấm theo danh mục để tính hoa hồng / lượt bấm
  const catRows = await db
    .select({ category: sql<string>`coalesce(${products.category}, 'Chưa có danh mục')`, orders: ordersOk, commission: commOk })
    .from(conversionItems)
    .innerJoin(products, eq(products.id, conversionItems.productId))
    .where(inRange)
    .groupBy(sql`coalesce(${products.category}, 'Chưa có danh mục')`);
  const catClicks = await db
    .select({ category: sql<string>`coalesce(${products.category}, 'Chưa có danh mục')`, n: sql<number>`count(*)::int` })
    .from(clicks)
    .innerJoin(products, eq(products.id, clicks.productId))
    .where(clickRange)
    .groupBy(sql`coalesce(${products.category}, 'Chưa có danh mục')`);
  const catClickMap = new Map(catClicks.map((c) => [c.category, Number(c.n)]));

  const chMap = new Map<string, { channel: string; clicks: number; orders: number; commission: number }>();
  for (const c of chClicks) chMap.set(c.channel, { channel: c.channel, clicks: Number(c.n), orders: 0, commission: 0 });
  for (const c of chOrders) {
    const e = chMap.get(c.channel) ?? { channel: c.channel, clicks: 0, orders: 0, commission: 0 };
    e.orders += Number(c.orders);
    e.commission += Number(c.commission);
    chMap.set(c.channel, e);
  }
  const doneBy = new Map(doneRows.map((r) => [r.month, Number(r.v)]));

  const tracked = new Set(top.filter((x) => x.productId).map((x) => x.productId!));
  const names = tracked.size ? await db.select({ id: products.id, name: products.name }).from(products).where(inArray(products.id, [...tracked])) : [];
  const nameBy = new Map(names.map((n) => [n.id, n.name]));

  return {
    from,
    to,
    totals: t,
    expected: Number(t.completed) + Number(t.pending) * (1 - cancel.rate),
    cancel,
    clicks: Number(clickCount),
    daily: daily.map((d) => ({ day: d.day, completed: Number(d.completed), pending: Number(d.pending), cancelled: Number(d.cancelled) })),
    byChannel: [...chMap.values()].sort((a, b) => b.commission - a.commission || b.clicks - a.clicks),
    byAttribution: att.map((a) => ({ attribution: a.attribution, orders: Number(a.orders), commission: Number(a.commission) })).sort((a, b) => b.commission - a.commission),
    topProducts: top.map((x) => ({ productId: x.productId, itemId: x.itemId, name: (x.productId && nameBy.get(x.productId)) || x.name || `Mã ${x.itemId ?? "?"}`, orders: Number(x.orders), qty: Number(x.qty), commission: Number(x.commission), tracked: !!x.productId })),
    byCategory: catRows
      .map((c) => ({ category: c.category, orders: Number(c.orders), commission: Number(c.commission), clicks: catClickMap.get(c.category) ?? 0 }))
      .sort((a, b) => b.commission - a.commission),
    months: monthsRows.map((m) => ({ month: m.month, orders: Number(m.orders), completed: Number(m.completed), pending: Number(m.pending), cancelled: Number(m.cancelled), completedInMonth: doneBy.get(m.month) ?? 0 })),
    lastImport: last ? { at: last.at, source: last.source } : null,
  };
}

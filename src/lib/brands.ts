/**
 * Trang theo thương hiệu (/thuong-hieu/xiaomi): "Deal Xiaomi", "Giá Anker hôm nay".
 * Sàn không trả về thương hiệu riêng, nên nhận thương hiệu từ tên sản phẩm theo danh sách thương hiệu phổ biến trên sàn
 * Việt Nam (khớp nguyên chữ, không phân biệt hoa thường). Chỉ thương hiệu có từ BRAND_MIN món còn bán mới có trang.
 * Thêm thương hiệu: thêm 1 dòng vào BRANDS (tên hiển thị, các cách viết khác nếu có).
 */
import { and, inArray } from "drizzle-orm";
import { products, type Product } from "@/db/schema";
import { availableSql } from "./availability";
import { db, ensureMigrated } from "./db";
import { enrichDeals, type DealRow } from "./queries";
import { slugify } from "./slug";

export const BRAND_MIN = 3;

/** [Tên hiển thị, ...cách viết khác]. Cách viết khác cũng được tính là thương hiệu đó (vd dòng con Redmi của Xiaomi) */
export const BRANDS: string[][] = [
  // Điện thoại, điện tử, phụ kiện
  ["Apple", "iPhone", "iPad", "AirPods", "MacBook"], ["Samsung", "Galaxy"], ["Xiaomi", "Redmi", "POCO"], ["OPPO"], ["vivo"], ["realme"], ["Huawei"], ["Honor"],
  ["Nokia"], ["Sony"], ["LG"], ["Lenovo"], ["Asus"], ["Acer"], ["Dell"], ["HP"], ["MSI"], ["Logitech"], ["Razer"], ["Corsair"], ["SteelSeries"], ["HyperX"],
  ["Anker", "Soundcore"], ["Baseus"], ["Ugreen"], ["Hoco"], ["Remax"], ["Pisen"], ["Belkin"], ["Aukey"], ["Xmobile"], ["Energizer"], ["Sandisk"], ["Kingston"],
  ["Samsung EVO"], ["Seagate"], ["WD", "Western Digital"], ["TP-Link"], ["Tenda"], ["Mercusys"], ["Edifier"], ["JBL"], ["Marshall"], ["Bose"], ["Sennheiser"],
  ["Soundpeats"], ["Havit"], ["Tronsmart"], ["Garmin"], ["Amazfit"], ["Huami"], ["Coros"], ["Kieslect"], ["Imou"], ["Ezviz"], ["Hikvision"], ["Canon"], ["Fujifilm"],
  ["Nikon"], ["GoPro"], ["DJI"], ["Insta360"], ["Nintendo"], ["PlayStation"], ["Akko"], ["Keychron"], ["Dareu"], ["E-Dra"], ["Rapoo"], ["Fuhlen"],
  // Gia dụng, điện máy
  ["Philips"], ["Panasonic"], ["Sharp"], ["Toshiba"], ["Electrolux"], ["Tefal"], ["Lock&Lock", "LocknLock", "Lock & Lock"], ["Sunhouse"], ["Kangaroo"], ["Bluestone"],
  ["Elmich"], ["Supor"], ["Cuckoo"], ["Lebenlang"], ["Lotte"], ["Midea"], ["Daikin"], ["Casper"], ["Hitachi"], ["Karofi"], ["Kangen"],
  ["Ecovacs", "Deebot"], ["Roborock"], ["Dreame"], ["Levoit"], ["Dyson"], ["Bear"], ["Hafele"], ["Rạng Đông"], ["Điện Quang"], ["Thermos"], ["Zojirushi"], ["Inochi"],
  // Mỹ phẩm, chăm sóc cá nhân
  ["L'Oréal", "L'Oreal", "Loreal"], ["La Roche-Posay", "La Roche Posay"], ["CeraVe"], ["Cetaphil"], ["Bioderma"], ["Vichy"], ["Eucerin"], ["Avène", "Avene"],
  ["Some By Mi"], ["Innisfree"], ["Cocoon"], ["Simple"], ["Senka"], ["Hada Labo"], ["Bioré", "Biore"], ["Skin1004"], ["Anessa"], ["Sunplay"], ["Klairs"], ["The Ordinary"],
  ["Paula's Choice"], ["Maybelline"], ["3CE"], ["Romand", "Rom&nd"], ["Black Rouge"], ["Vaseline"], ["Nivea"], ["Dove"], ["Pond's", "Ponds"], ["Garnier"],
  ["Sunsilk"], ["Head & Shoulders"], ["TRESemmé", "Tresemme"], ["Pantene"], ["Colgate"], ["P/S"], ["Sensodyne"], ["Oral-B"], ["Listerine"],
  ["Gillette"], ["Lifebuoy"], ["Hazeline"], ["Dr.Ci:Labo"],
  // Mẹ & bé, gia đình
  ["Huggies"], ["Pampers"], ["Bobby"], ["Merries"], ["Moony"], ["Pigeon"], ["Comfort"], ["OMO"], ["Ariel"], ["Downy"], ["Sunlight"], ["Vim"], ["Lix"],
  // Thực phẩm, đồ uống
  ["Vinamilk"], ["TH true MILK", "TH True Milk"], ["Nestlé", "Nestle"], ["Milo"], ["Nescafé", "Nescafe"], ["Abbott"], ["Ensure"], ["Similac"], ["Meiji"], ["Aptamil"],
  ["G7"], ["Trung Nguyên"], ["Highlands"], ["Ajinomoto"], ["Chinsu"], ["Omachi"], ["Hảo Hảo"],
  // Thời trang, thể thao
  ["Nike"], ["Adidas"], ["Puma"], ["New Balance"], ["Asics"], ["Converse"], ["Vans"], ["Fila"], ["MLB"], ["Biti's", "Bitis"], ["Ananas"], ["Coolmate"], ["Uniqlo"],
  ["Yody"], ["Casio"], ["Citizen"], ["Seiko"], ["Orient"], ["Crocs"], ["Skechers"], ["Under Armour"], ["Decathlon", "Kalenji", "Quechua"],
];

export interface BrandRef {
  slug: string;
  name: string;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const fold = (s: string) => s.normalize("NFC").toLowerCase();

/** Bảng tra: cách viết (thường) -> thương hiệu, và 1 biểu thức khớp mọi cách viết (dài trước để "Samsung EVO" thắng "Samsung") */
const ALIAS = new Map<string, BrandRef>();
for (const [name, ...aliases] of BRANDS) {
  const ref = { name, slug: slugify(name) };
  for (const a of [name, ...aliases]) ALIAS.set(fold(a), ref);
}
// Không dùng lookbehind (Safari cũ không hỗ trợ): nhóm 1 là ký tự đứng trước (hoặc đầu chuỗi), nhóm 2 là tên hãng
const RE = new RegExp(`(^|[^\\p{L}\\p{N}])(${[...ALIAS.keys()].sort((a, b) => b.length - a.length).map(escapeRe).join("|")})(?![\\p{L}\\p{N}])`, "iu");

/** Hãng thiết bị: tên phụ kiện hay nhắc tới để nói "dùng cho máy nào", không phải hãng sản xuất */
const DEVICE = new Set(["apple", "samsung", "xiaomi", "oppo", "vivo", "realme", "huawei", "honor", "nokia", "sony", "lenovo", "asus", "dell", "hp", "acer", "nintendo", "playstation", "dji", "gopro", "garmin", "amazfit"]);
/** Tên bắt đầu bằng các từ này là phụ kiện (ốp, cáp, kính cường lực…) */
const ACCESSORY = /^\s*(ốp|bao|vỏ|case|kính|miếng dán|dán|cường lực|dây|cáp|củ sạc|sạc|giá đỡ|đế|túi|bọc|núm|nút|pin thay|màn hình thay|linh kiện|phụ kiện|tay cầm|skin|sticker|móc|bút)/iu;
/** Dòng máy (không phải tên hãng): iPhone, Galaxy, Redmi… */
const LINE_ALIASES = new Set(["iphone", "ipad", "airpods", "macbook", "galaxy", "redmi", "poco"]);
/** Ngay sau tên hãng là tên/mã dòng máy */
const MODEL_NEXT = /^\s+(iphone|ipad|galaxy|redmi|poco|note|reno|find|pixel|mate|nova|watch|band|tab|[aysmxzk]\d{1,3}\b|\d{1,2}(?=\s|$))/iu;
/** "cho iPhone", "for Samsung", "dành cho", "tương thích" ngay trước tên hãng */
const FOR_BEFORE = /(cho|for|dành cho|tương thích( với)?|compatible( with)?|thay thế)\s*$/iu;

/** Thương hiệu của 1 sản phẩm theo tên (thương hiệu xuất hiện sớm nhất, bỏ qua hãng máy được nhắc trong tên phụ kiện) */
export function detectBrand(name: string): BrandRef | null {
  const text = name.normalize("NFC");
  const accessory = ACCESSORY.test(text);
  const re = new RegExp(RE.source, "giu");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const start = m.index + m[1].length;
    const end = start + m[2].length;
    const ref = ALIAS.get(fold(m[2]));
    if (!ref) continue;
    const device = DEVICE.has(ref.slug);
    if (device) {
      if (FOR_BEFORE.test(text.slice(Math.max(0, start - 22), start))) continue;
      // Tên phụ kiện: hãng máy đi liền tên dòng máy ("Ốp lưng Xiaomi Redmi Note 13", "Kính Samsung A54") là nói máy dùng cùng,
      // còn "Sạc dự phòng Xiaomi 10000mAh" là đồ của chính hãng đó
      const line = LINE_ALIASES.has(fold(m[2]));
      if (accessory && (line || MODEL_NEXT.test(text.slice(end)))) continue;
    }
    return ref;
  }
  return null;
}

export const brandPath = (b: Pick<BrandRef, "slug">) => `/thuong-hieu/${b.slug}`;

interface BrandIndex {
  at: number;
  brands: Map<string, BrandRef & { ids: number[] }>;
}
let cache: BrandIndex | null = null;

/** Thương hiệu -> các món còn bán (tính lại mỗi 10 phút) */
async function brandIndex(now = Date.now()): Promise<BrandIndex["brands"]> {
  if (cache && now - cache.at < 10 * 60_000) return cache.brands;
  await ensureMigrated();
  const rows = await db.select({ id: products.id, name: products.name }).from(products).where(availableSql());
  const brands = new Map<string, BrandRef & { ids: number[] }>();
  for (const r of rows) {
    const b = detectBrand(r.name);
    if (!b) continue;
    (brands.get(b.slug) ?? brands.set(b.slug, { ...b, ids: [] }).get(b.slug)!).ids.push(r.id);
  }
  cache = { at: now, brands };
  return brands;
}
/** Xoá bộ nhớ đệm (sau khi đồng bộ hoặc khi kiểm thử) */
export const resetBrandCache = () => {
  cache = null;
};

/** Thương hiệu có trang (≥ BRAND_MIN món còn bán), nhiều món trước */
export async function listBrands(min = BRAND_MIN): Promise<(BrandRef & { count: number })[]> {
  const idx = await brandIndex();
  return [...idx.values()].filter((b) => b.ids.length >= min).map((b) => ({ slug: b.slug, name: b.name, count: b.ids.length })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Thương hiệu của món (chỉ khi thương hiệu đó có trang) – để trang sản phẩm dẫn link */
export async function brandOf(p: Pick<Product, "name">): Promise<(BrandRef & { count: number }) | null> {
  const b = detectBrand(p.name);
  if (!b) return null;
  const idx = await brandIndex();
  const n = idx.get(b.slug)?.ids.length ?? 0;
  return n >= BRAND_MIN ? { ...b, count: n } : null;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};

export interface BrandReport {
  brand: BrandRef;
  count: number;
  /** Deal tốt nhất trước (điểm deal) */
  deals: DealRow[];
  /** Rẻ nhất trước */
  cheapest: DealRow[];
  realDeals: number;
  bestDrop: number;
  minPrice: number;
  maxPrice: number;
  mall: number;
  byPlatform: { platform: string; n: number; medianDrop: number; min: number }[];
  byCategory: { category: string; n: number }[];
}

export async function brandReport(slug: string): Promise<BrandReport | null> {
  const idx = await brandIndex();
  const b = idx.get(slug);
  if (!b || b.ids.length < BRAND_MIN) return null;
  const rows = (await db.select().from(products).where(and(inArray(products.id, b.ids.slice(0, 2000)), availableSql()))) as Product[];
  if (rows.length < BRAND_MIN) return null;
  const byScore = [...rows].sort((x, y) => y.dealScore - x.dealScore);
  const byPrice = [...rows].sort((x, y) => x.price - y.price);
  const [deals, cheapest] = await Promise.all([enrichDeals(byScore.slice(0, 16)), enrichDeals(byPrice.slice(0, 8))]);
  const plat = new Map<string, Product[]>();
  for (const p of rows) (plat.get(p.platform) ?? plat.set(p.platform, []).get(p.platform)!).push(p);
  const cat = new Map<string, number>();
  for (const p of rows) if (p.category) cat.set(p.category, (cat.get(p.category) ?? 0) + 1);
  return {
    brand: { slug: b.slug, name: b.name },
    count: rows.length,
    deals,
    cheapest,
    realDeals: rows.filter((p) => p.realDropPct >= 10).length,
    bestDrop: Math.max(0, ...rows.map((p) => p.realDropPct)),
    minPrice: byPrice[0].price,
    maxPrice: byPrice[byPrice.length - 1].price,
    mall: rows.filter((p) => p.shopType === "mall").length,
    byPlatform: [...plat.entries()]
      .map(([platform, ps]) => ({ platform, n: ps.length, medianDrop: median(ps.map((p) => p.realDropPct)), min: Math.min(...ps.map((p) => p.price)) }))
      .sort((x, y) => y.n - x.n),
    byCategory: [...cat.entries()].map(([category, n]) => ({ category, n })).sort((x, y) => y.n - x.n).slice(0, 8),
  };
}

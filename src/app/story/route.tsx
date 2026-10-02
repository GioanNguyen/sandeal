import { inArray } from "drizzle-orm";
import { products } from "@/db/schema";
import { db, ensureMigrated } from "@/lib/db";
import { siteUrl } from "@/lib/mail";
import { storyImage } from "@/lib/og";

export const runtime = "nodejs";

/** Tiêu đề ảnh Story theo mẫu bài */
const HEADLINE: Record<string, string> = {
  "that-hay-ao": "Giảm thật hay giảm ảo?",
  "mua-hay-cho": "Mua ngay hay chờ sale?",
  "don-vi": "Rẻ hơn khi tính theo đơn vị",
  "doan-gia": "Đoán giá món này!",
  "ky-luc": "Giá thấp kỷ lục",
  "so-san": "Sàn nào rẻ hơn?",
  "sau-ma": "Giá sau khi áp mã",
  "vua-giam": "Vừa giảm hôm nay",
  "tong-hop": "Deal giảm thật hôm nay",
  "nang-gia": "Những món bị nâng giá trước sale",
  "boc-gia-ao": "Ghi giảm sâu, giá như mọi ngày",
};

/** Ảnh Story 1080×1920: /story?k=ky-luc&p=4004 (tối đa 4 món, cách nhau dấu phẩy) */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const kind = u.searchParams.get("k") ?? "";
  const ids = (u.searchParams.get("p") ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 4);
  await ensureMigrated();
  const rows = ids.length ? await db.select().from(products).where(inArray(products.id, ids)) : [];
  const items = ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is (typeof rows)[number] => !!r);
  const host = siteUrl().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const res = await storyImage({
    headline: HEADLINE[kind] ?? "Deal giảm thật hôm nay",
    items,
    hidePrice: kind === "doan-gia",
    link: items.length === 1 ? `${host}/p/${items[0].id}` : host,
  });
  res.headers.set("Cache-Control", "public, max-age=600");
  return res;
}

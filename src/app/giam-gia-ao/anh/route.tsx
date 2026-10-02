import { fakeDeals, fakeDealsByIds } from "@/lib/fakedeals";
import { siteUrl } from "@/lib/mail";
import { fakeDealsImage } from "@/lib/og";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ảnh bài "Bóc giá ảo" 1080×1350: /giam-gia-ao/anh?p=12,34,56 (tối đa 3 món); không có ?p thì lấy 3 món rõ nhất hiện tại */
export async function GET(req: Request) {
  const ids = (new URL(req.url).searchParams.get("p") ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 3);
  const list = ids.length ? await fakeDealsByIds(ids) : await fakeDeals({ limit: 3 });
  const host = new URL(siteUrl()).host.replace(/^www\./, "");
  const res = await fakeDealsImage({
    items: list.map(({ p, claim, real, usual }) => ({ name: p.name, platform: p.platform, imageUrl: p.imageUrl, price: p.price, claim, real, usual })),
    link: `${host}/giam-gia-ao`,
  });
  res.headers.set("cache-control", "public, max-age=600");
  return res;
}

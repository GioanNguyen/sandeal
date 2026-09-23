import { NextResponse } from "next/server";
import { allow, clientIp } from "@/lib/ratelimit";
import { checkLink } from "@/lib/lookup";
import { calcVouchers, compareOffers, getProduct } from "@/lib/queries";
import { timeWeightedMedian } from "@/lib/score";
import { bestPlan } from "@/lib/voucher";
import { siteUrl } from "@/lib/mail";

/** API cho tiện ích trình duyệt: dữ liệu công khai, cho phép mọi origin đọc */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=300",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url") ?? "";
  if (!(await allow(`ext:${clientIp(req)}`, 120, 600))) {
    return NextResponse.json({ status: "error", error: "Quá nhiều yêu cầu" }, { status: 429, headers: CORS });
  }
  const r = await checkLink(url);
  const site = siteUrl();
  if (r.status !== "found") {
    return NextResponse.json({ status: r.status, checkUrl: `${site}/kiem-tra-gia?url=${encodeURIComponent(url)}` }, { headers: CORS });
  }
  const p = (await getProduct(r.productId))!;
  const prices = p.prices.map((x) => x.price);
  const low = prices.length ? Math.min(...prices) : p.price;
  const med = p.prices.length ? timeWeightedMedian(p.prices, new Date()) : p.price;
  const trackedDays = p.prices.length ? (Date.now() - p.prices[0].capturedAt.getTime()) / 86_400_000 : 0;
  const verdict = trackedDays < 7 ? "new" : p.price <= low || p.realDropPct >= 10 ? "good" : "wait";
  const [offers, vs] = await Promise.all([compareOffers(p), calcVouchers(p.platform)]);
  const plan = bestPlan({ platform: p.platform, subtotal: p.price, shipping: 30_000 }, vs);

  return NextResponse.json(
    {
      status: "found",
      product: {
        id: p.id,
        name: p.name,
        platform: p.platform,
        price: p.price,
        low90: low,
        usual: med,
        realDropPct: p.realDropPct,
        dealScore: Math.round(p.dealScore),
        verdict,
        trackedDays: Math.floor(trackedDays),
        history: p.prices.map((x) => [x.capturedAt.getTime(), x.price]),
        afterCodes: p.price - plan.discount - plan.cashback,
      },
      offers: offers.map((o) => ({ id: o.id, platform: o.platform, price: o.price, detail: `${site}/product/${o.id}` })),
      links: {
        detail: `${site}/product/${p.id}`,
        watch: `${site}/product/${p.id}#theo-doi`,
        calc: `${site}/tinh-gia?p=${p.id}`,
        buy: `${site}/go/${p.id}`,
      },
    },
    { headers: CORS },
  );
}

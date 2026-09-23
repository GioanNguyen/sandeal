import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { median } from "@/lib/score";
import { vnd } from "@/lib/format";
import { PlatformBadge } from "@/components/PlatformBadge";
import { PriceChart } from "@/components/PriceChart";
import { WatchForm } from "@/components/WatchForm";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await prisma.product.findUnique({
    where: { id: Number(id) || 0 },
    include: { prices: { orderBy: { capturedAt: "asc" }, where: { capturedAt: { gte: new Date(Date.now() - 90 * 86_400_000) } } } },
  });
  if (!p) notFound();

  const prices = p.prices.map((x) => x.price);
  const low = prices.length ? Math.min(...prices) : p.price;
  const med = prices.length ? median(prices) : p.price;

  return (
    <div className="detail">
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.imageUrl ?? ""} alt={p.name} />
      </div>
      <div>
        <div className="row"><PlatformBadge platform={p.platform} /> <span className="muted">{p.shopName}</span></div>
        <h1>{p.name}</h1>
        <div>
          <span className="price" style={{ fontSize: 28 }}>{vnd(p.price)}</span>
          {p.originalPrice && p.originalPrice > p.price ? <span className="strike">{vnd(p.originalPrice)}</span> : null}
        </div>
        <p className="muted">
          Điểm deal <b>{Math.round(p.dealScore)}</b>/100 · Thấp nhất 90 ngày {vnd(low)} · Trung vị {vnd(med)}
          {p.price <= low ? <b className="good"> · Đang là giá thấp nhất</b> : null}
        </p>
        <p className="muted">Cập nhật lúc {p.lastSeenAt.toLocaleString("vi-VN")}</p>
        <p><a className="btn" href={p.affiliateUrl} target="_blank" rel="nofollow sponsored noopener">Mua trên sàn →</a></p>

        <div className="panel">
          <b>Lịch sử giá 90 ngày</b>
          <PriceChart points={p.prices} current={p.price} />
        </div>
        <div className="panel">
          <b>Báo tôi khi giá giảm</b>
          <p className="muted">Nhận email khi giá xuống bằng hoặc thấp hơn mức bạn đặt.</p>
          <WatchForm productId={p.id} suggested={Math.round((low * 0.98) / 1000) * 1000} />
        </div>
      </div>
    </div>
  );
}

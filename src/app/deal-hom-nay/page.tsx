import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { DayDropList } from "@/components/DayDropList";
import { DealGrid } from "@/components/DealGrid";
import { Icon } from "@/components/Icon";
import { dayDrops, recentDays } from "@/lib/daily";
import { vnDateLabel, vnDayStart } from "@/lib/pricehist";
import { listDeals } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const today = vnDateLabel(Date.now());
  const n = (await dayDrops(vnDayStart(Date.now()))).length;
  const title = `Deal hôm nay ${today.slice(0, 5)}: ${n ? `${n} món vừa giảm giá thật` : "deal giảm giá thật"} trên Shopee, Lazada, TikTok Shop`;
  return {
    title,
    description: `Những món vừa giảm giá hôm nay (${today}) và rẻ hơn giá thường ngày 30 ngày của chính món đó – cập nhật liên tục trong ngày.`,
    alternates: { canonical: "/deal-hom-nay" },
    openGraph: { title },
  };
}

export default async function DealToday() {
  const now = Date.now();
  const start = vnDayStart(now);
  const [drops, days, best] = await Promise.all([dayDrops(start, now), recentDays(14), listDeals({ minDrop: 10, sort: "score", page: 1, pageSize: 12 })]);
  const updated = new Date(now).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
  return (
    <>
      <Breadcrumbs items={[{ name: "Deal hôm nay" }]} />
      <header className="roundup-head">
        <span className="roundup-week"><Icon name="clock" size={14} /> Cập nhật {updated} · {vnDateLabel(now)}</span>
        <h1 className="page-title">Deal hôm nay {vnDateLabel(now).slice(0, 5)}</h1>
        <p className="page-sub">
          Những món <b>vừa giảm giá trong hôm nay</b> và đang rẻ hơn giá thường ngày 30 ngày của chính món đó ít nhất 10% – không dựa vào giá gạch của shop.
          Giá sàn đổi liên tục, hãy xem giá cuối cùng trên sàn trước khi thanh toán.
        </p>
      </header>

      <section className="section" aria-labelledby="today-head">
        <div className="section-head"><h2 id="today-head"><Icon name="trendingDown" size={22} /> Vừa giảm hôm nay</h2><span className="muted" style={{ fontSize: 13 }}>{drops.length} món</span></div>
        {drops.length ? <DayDropList items={drops} today /> : <p className="muted">Hôm nay chưa có món nào giảm thật từ 10%. Xem các deal tốt đang có bên dưới.</p>}
      </section>

      <section className="section" aria-labelledby="best-head">
        <div className="section-head"><h2 id="best-head"><Icon name="flame" size={22} /> Deal tốt đang có</h2><Link href="/">Xem tất cả <Icon name="arrowRight" size={16} /></Link></div>
        <DealGrid items={best.items} />
      </section>

      {days.length > 0 && (
        <section className="section" aria-labelledby="past-head">
          <div className="section-head"><h2 id="past-head">Deal những ngày trước</h2></div>
          <nav className="chips wrap">{days.map((d) => <Link key={d.slug} className="chip" href={`/deal-hom-nay/${d.slug}`}>{d.slug.slice(0, 5).replace("-", "/")} <span className="muted">{d.count}</span></Link>)}</nav>
        </section>
      )}
    </>
  );
}

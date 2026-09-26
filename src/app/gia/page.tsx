import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { priceTopics, topicName } from "@/lib/pricepages";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Giá hôm nay – bảng giá sản phẩm trên Shopee, Lazada, TikTok Shop",
  description: "Tra giá hôm nay của từng loại sản phẩm: rẻ nhất ở sàn nào, biểu đồ giá, thấp nhất từng ghi nhận và nên mua lúc nào.",
  alternates: { canonical: "/gia" },
};

export default async function PriceIndex() {
  const topics = await priceTopics();
  return (
    <>
      <Breadcrumbs items={[{ name: "Giá hôm nay" }]} />
      <h1 className="page-title">Giá hôm nay</h1>
      <p className="page-sub">Chọn loại sản phẩm để xem giá rẻ nhất trên 3 sàn, biểu đồ giá và lời khuyên nên mua lúc nào – tính từ lịch sử giá thật.</p>
      {topics.length ? (
        <nav className="chips wrap" aria-label="Loại sản phẩm">
          {topics.map((t) => <Link key={t.slug} className="chip" href={`/gia/${t.slug}`}>Giá {topicName(t)} <span className="muted">{t.count}</span></Link>)}
        </nav>
      ) : (
        <div className="empty">Chưa đủ dữ liệu.</div>
      )}
    </>
  );
}

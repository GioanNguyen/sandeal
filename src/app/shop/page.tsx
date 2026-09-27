import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PLATFORMS } from "@/lib/format";
import { listShops } from "@/lib/shops";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Shop trên Shopee, Lazada, TikTok Shop: giảm giá thật hay ảo?",
  description: "Xem từng shop có bao nhiêu món đang giảm thật, bao nhiêu món ghi % giảm cao hơn thực tế – tính từ lịch sử giá Săn Deal theo dõi.",
  alternates: { canonical: "/shop" },
};

export default async function ShopsIndex() {
  const shops = await listShops();
  return (
    <>
      <Breadcrumbs items={[{ name: "Shop" }]} />
      <h1 className="page-title">Shop có giảm giá thật không?</h1>
      <p className="page-sub">Mỗi shop có trang riêng tổng hợp lịch sử giá các món Săn Deal đang theo dõi (từ 3 món trở lên).</p>
      {Object.entries(PLATFORMS).map(([k, p]) => {
        const list = shops.filter((s) => s.platform === k);
        if (!list.length) return null;
        return (
          <section key={k} className="section" aria-labelledby={`sh-${k}`}>
            <div className="section-head"><h2 id={`sh-${k}`}>{p.label}</h2></div>
            <nav className="chips wrap">{list.map((s) => <Link key={s.slug} className="chip" href={`/shop/${s.slug}`}>{s.shopName} <span className="muted">{s.count}</span></Link>)}</nav>
          </section>
        );
      })}
      {!shops.length && <p className="muted">Chưa có shop nào đủ dữ liệu.</p>}
    </>
  );
}

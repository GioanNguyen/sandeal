import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { listBrands } from "@/lib/brands";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Deal theo thương hiệu – giá Xiaomi, Anker, Samsung… hôm nay",
  description: "Giá hôm nay và deal giảm thật theo từng thương hiệu trên Shopee, Lazada, TikTok Shop, so với lịch sử giá 30 ngày.",
  alternates: { canonical: "/thuong-hieu" },
};

export default async function Brands() {
  const brands = await listBrands();
  // Nhóm theo chữ cái đầu để dễ tìm
  const groups = new Map<string, typeof brands>();
  for (const b of [...brands].sort((a, c) => a.name.localeCompare(c.name, "vi"))) {
    const k = b.name.charAt(0).toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(b);
  }
  return (
    <>
      <Breadcrumbs items={[{ name: "Thương hiệu" }]} />
      <h1 className="page-title">Deal theo thương hiệu</h1>
      <p className="page-sub">Giá hôm nay và các món đang giảm thật của từng thương hiệu. Chỉ hiện thương hiệu có từ 3 sản phẩm đang bán.</p>
      {brands.length === 0 ? (
        <div className="empty">Chưa đủ dữ liệu để lập trang thương hiệu.</div>
      ) : (
        <>
          <section className="section" aria-labelledby="top-head">
            <div className="section-head"><h2 id="top-head">Nhiều sản phẩm nhất</h2></div>
            <nav className="chips wrap">{brands.slice(0, 20).map((b) => <Link key={b.slug} className="chip" href={`/thuong-hieu/${b.slug}`}>{b.name} <span className="muted">{b.count}</span></Link>)}</nav>
          </section>
          <section className="section" aria-labelledby="az-head">
            <div className="section-head"><h2 id="az-head">Từ A đến Z</h2></div>
            <div className="brand-az">
              {[...groups.entries()].map(([k, list]) => (
                <div key={k}>
                  <h3>{k}</h3>
                  <ul>{list.map((b) => <li key={b.slug}><Link href={`/thuong-hieu/${b.slug}`}>{b.name}</Link> <span className="muted">{b.count}</span></li>)}</ul>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { roundupDefs, weekLabel } from "@/lib/roundups";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: `Top deal giảm thật tuần này (${weekLabel()})`,
  description: "Các bảng xếp hạng deal giảm thật theo loại sản phẩm, danh mục và tầm giá – cập nhật liên tục theo lịch sử giá Shopee, Lazada, TikTok Shop.",
  alternates: { canonical: "/top" },
};

export default async function TopIndex() {
  const defs = await roundupDefs();
  const groups: { title: string; icon: "tag" | "grid" | "trendingDown"; items: typeof defs }[] = [
    { title: "Theo loại sản phẩm", icon: "tag", items: defs.filter((d) => d.kind === "type") },
    { title: "Theo danh mục", icon: "grid", items: defs.filter((d) => d.kind === "category") },
    { title: "Theo tầm giá", icon: "trendingDown", items: defs.filter((d) => d.kind === "band") },
  ];
  return (
    <>
      <h1 className="page-title">Top deal giảm thật tuần này</h1>
      <p className="page-sub">Bảng xếp hạng tự động từ lịch sử giá thật ({weekLabel()}). Chỉ có món đang rẻ hơn giá 30 ngày, không xếp theo hoa hồng.</p>
      {groups.filter((g) => g.items.length).map((g) => (
        <section key={g.title} className="section">
          <div className="section-head"><h2><Icon name={g.icon} size={20} /> {g.title}</h2></div>
          <div className="top-index">
            {g.items.map((d) => (
              <Link key={d.slug} href={`/top/${d.slug}`} className="top-card">
                <b>{d.title}</b>
                <span>{d.count} món đang giảm thật</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

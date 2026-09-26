import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { GUIDES } from "@/lib/guides";

export const metadata: Metadata = {
  title: "Hướng dẫn săn deal: nhận biết giảm giá ảo, dùng mã giảm giá, chọn thời điểm mua",
  description: "Các bài hướng dẫn mua sắm online thông minh trên Shopee, Lazada, TikTok Shop – kèm deal giảm thật đang có.",
  alternates: { canonical: "/huong-dan" },
};

export default function GuidesIndex() {
  return (
    <>
      <Breadcrumbs items={[{ name: "Hướng dẫn" }]} />
      <h1 className="page-title">Hướng dẫn săn deal</h1>
      <p className="page-sub">Mẹo mua sắm online không bị hớ, viết ngắn gọn và dẫn tới công cụ để bạn tự kiểm tra.</p>
      <div className="guide-list">
        {GUIDES.map((g) => (
          <Link key={g.slug} href={`/huong-dan/${g.slug}`} className="guide-card">
            <h2>{g.title}</h2>
            <p>{g.description}</p>
          </Link>
        ))}
      </div>
    </>
  );
}

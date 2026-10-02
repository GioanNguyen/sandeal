import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { guidePublishAt, publishedGuides } from "@/lib/guides";

export const metadata: Metadata = {
  title: "Hướng dẫn săn deal: nhận biết giảm giá ảo, dùng mã giảm giá, chọn thời điểm mua",
  description: "Các bài hướng dẫn mua sắm online thông minh trên Shopee, Lazada, TikTok Shop – kèm deal giảm thật đang có. Bài mới mỗi tuần.",
  alternates: { canonical: "/huong-dan", types: { "application/rss+xml": "/huong-dan/rss.xml" } },
};
export const dynamic = "force-dynamic";

const vnDate = (d: Date) => d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" });

export default function GuidesIndex() {
  const now = new Date();
  const list = publishedGuides(now);
  return (
    <>
      <Breadcrumbs items={[{ name: "Hướng dẫn" }]} />
      <h1 className="page-title">Hướng dẫn săn deal</h1>
      <p className="page-sub">
        Mẹo mua sắm online không bị hớ, viết ngắn gọn và dẫn tới công cụ để bạn tự kiểm tra. Bài mới mỗi tuần – theo dõi qua{" "}
        <a href="/huong-dan/rss.xml">RSS</a>.
      </p>
      <div className="guide-list">
        {list.map((g) => {
          const at = guidePublishAt(g);
          const fresh = now.getTime() - at.getTime() < 7 * 86_400_000;
          return (
            <Link key={g.slug} href={`/huong-dan/${g.slug}`} className="guide-card">
              <span className="guide-date">{fresh ? <b className="guide-new">Mới</b> : null} {vnDate(at)}</span>
              <h2>{g.title}</h2>
              <p>{g.description}</p>
            </Link>
          );
        })}
      </div>
    </>
  );
}

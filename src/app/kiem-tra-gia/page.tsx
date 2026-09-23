import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkLink } from "@/lib/lookup";
import { PLATFORMS } from "@/lib/format";
import { allow } from "@/lib/ratelimit";
import { Icon } from "@/components/Icon";
import { LinkCheckForm } from "@/components/LinkCheckForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Kiểm tra giá thật – dán link Shopee, Lazada, TikTok Shop",
  description: "Dán link sản phẩm để xem lịch sử giá, biết giảm giá thật hay ảo và nhận báo khi giá xuống.",
  alternates: { canonical: "/kiem-tra-gia" },
};

export default async function CheckPage({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  const { url } = await searchParams;
  let error = "";
  let queued: { platform: string; url: string } | null = null;

  if (url) {
    const h = await headers();
    const ip = (h.get("x-forwarded-for")?.split(",")[0] || "local").trim();
    if (!(await allow(`check:${ip}`, 30, 600))) {
      error = "Bạn kiểm tra quá nhiều link, thử lại sau ít phút.";
    } else {
      const r = await checkLink(url);
      if (r.status === "found") redirect(`/product/${r.productId}${r.isNew ? "?moi=1" : ""}`);
      if (r.status === "invalid") error = "Không nhận ra link này. Hãy dán link trang sản phẩm Shopee, Lazada hoặc TikTok Shop.";
      if (r.status === "queued") queued = { platform: r.ref.platform, url: r.ref.url };
    }
  }

  return (
    <div className="check-page">
      <span className="auth-icon"><Icon name="link" size={26} /></span>
      <h1 className="page-title">Kiểm tra giá thật</h1>
      <p className="page-sub">Dán link sản phẩm để xem lịch sử giá, biết đang giảm thật hay chỉ “nâng giá rồi giảm”.</p>
      <LinkCheckForm variant="page" defaultValue={url} />
      {error && <p className="form-msg warn" role="alert"><Icon name="alert" size={16} /> {error}</p>}
      {queued && (
        <div className="verdict wait" role="status" style={{ textAlign: "left" }}>
          <Icon name="clock" size={22} />
          <div>
            <b>Chưa có dữ liệu cho sản phẩm này</b>
            <p>
              Chúng tôi đã ghi nhận link {PLATFORMS[queued.platform]?.label} này và sẽ bắt đầu theo dõi giá ở lần cập nhật tới.
              Quay lại sau vài giờ nhé. <a href={queued.url} target="_blank" rel="nofollow noopener" style={{ color: "var(--primary)", fontWeight: 600 }}>Mở trên sàn</a>
            </p>
          </div>
        </div>
      )}
      <ol className="steps">
        <li><b>Mở sản phẩm</b> trên app hoặc web Shopee, Lazada, TikTok Shop</li>
        <li><b>Chia sẻ → Sao chép liên kết</b> (link rút gọn cũng được)</li>
        <li><b>Dán vào ô trên</b> để xem biểu đồ giá, điểm deal và đặt báo giá</li>
      </ol>
    </div>
  );
}

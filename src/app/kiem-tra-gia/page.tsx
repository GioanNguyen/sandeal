import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { checkLink } from "@/lib/lookup";
import { PLATFORMS } from "@/lib/format";
import { allow } from "@/lib/ratelimit";
import { Icon } from "@/components/Icon";
import { LinkCheckForm } from "@/components/LinkCheckForm";
import { DealGrid } from "@/components/DealGrid";
import { RequestWatchForm } from "@/components/RequestWatchForm";
import { getCurrentUser } from "@/lib/auth";
import { similarForHint } from "@/lib/requestwatch";
import type { DealRow } from "@/lib/queries";

/**
 * Chia sẻ từ app sàn (nút Chia sẻ trên điện thoại -> Săn Deal) thường đặt link trong "text" kèm tên sản phẩm,
 * không phải trong "url": lấy link đầu tiên tìm thấy, phần chữ còn lại làm tên gợi ý.
 */
function fromShare(sp: { url?: string; text?: string; title?: string }) {
  const all = [sp.url, sp.text, sp.title].filter(Boolean).join(" ");
  const link = all.match(/https?:\/\/\S+/)?.[0] || sp.url?.trim() || sp.text?.trim() || "";
  const words = all.replace(/https?:\/\/\S+/g, " ").replace(/\s+/g, " ").trim();
  // Chỉ coi là tên khi có link đi kèm (một chuỗi chữ không có link thì để checkLink báo không nhận ra)
  return { link, nameHint: link !== words && words.length >= 6 && /https?:\/\//.test(all) ? words.slice(0, 140) : undefined };
}

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Kiểm tra giá thật – dán link Shopee, Lazada, TikTok Shop",
  description: "Dán link sản phẩm để xem lịch sử giá, biết giảm giá thật hay ảo và nhận báo khi giá xuống.",
  alternates: { canonical: "/kiem-tra-gia" },
};

export default async function CheckPage({ searchParams }: { searchParams: Promise<{ url?: string; text?: string; title?: string }> }) {
  const sp = await searchParams;
  const { link: url, nameHint } = fromShare(sp);
  let error = "";
  let queued: { platform: string; url: string; requestId: number; nameHint?: string } | null = null;
  let similar: { items: DealRow[]; keyword: string | null } = { items: [], keyword: null };

  const user = url ? await getCurrentUser() : null;
  if (url) {
    const h = await headers();
    const ip = (h.get("x-forwarded-for")?.split(",")[0] || "local").trim();
    if (!(await allow(`check:${ip}`, 30, 600))) {
      error = "Bạn kiểm tra quá nhiều link, thử lại sau ít phút.";
    } else {
      const r = await checkLink(url, { nameHint });
      if (r.status === "found") redirect(`/product/${r.productId}${r.isNew ? "?moi=1" : ""}`);
      if (r.status === "invalid") error = "Không nhận ra link này. Hãy dán link trang sản phẩm Shopee, Lazada hoặc TikTok Shop.";
      if (r.status === "queued") {
        queued = { platform: r.ref.platform, url: r.ref.url, requestId: r.requestId, nameHint: r.ref.nameHint };
        similar = await similarForHint(r.ref.nameHint);
      }
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
              {queued.nameHint ? <><b style={{ display: "inline", fontSize: "inherit" }}>{queued.nameHint}</b> – </> : null}
              Săn Deal đã ghi nhận link {PLATFORMS[queued.platform]?.label} này và sẽ bắt đầu theo dõi giá.{" "}
              <a href={queued.url} target="_blank" rel="nofollow noopener" style={{ color: "var(--primary)", fontWeight: 600 }}>Mở trên sàn</a>
            </p>
            <RequestWatchForm requestId={queued.requestId} userEmail={user?.email} />
          </div>
        </div>
      )}
      {queued && similar.items.length > 0 && (
        <section className="check-similar" aria-labelledby="sim-head">
          <h2 id="sim-head">Món tương tự đã có lịch sử giá</h2>
          <p className="muted" style={{ margin: "0 0 12px", fontSize: 14 }}>Các món khớp “{similar.keyword}” Săn Deal đang theo dõi – xem để biết mức giá hợp lý trong lúc chờ.</p>
          <DealGrid items={similar.items} />
        </section>
      )}
      <p className="muted" style={{ marginTop: 12 }}>
        Không có link, chỉ có ảnh chụp màn hình? <Link href="/tim-bang-anh" style={{ color: "var(--primary)", fontWeight: 600 }}>Tìm bằng ảnh</Link>
      </p>
      <ol className="steps">
        <li><b>Mở sản phẩm</b> trên app hoặc web Shopee, Lazada, TikTok Shop</li>
        <li><b>Chia sẻ → Sao chép liên kết</b> (link rút gọn cũng được)</li>
        <li><b>Dán vào ô trên</b> để xem biểu đồ giá, điểm deal và đặt báo giá</li>
      </ol>
    </div>
  );
}

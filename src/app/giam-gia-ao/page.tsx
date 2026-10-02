import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CardImage } from "@/components/CardImage";
import { FollowBox } from "@/components/FollowBox";
import { Icon } from "@/components/Icon";
import { ShareButtons } from "@/components/ShareButtons";
import { FAKE_MAX_REAL, FAKE_MIN_CLAIM, FAKE_MIN_DAYS, fakeDeals, realLabel } from "@/lib/fakedeals";
import { PLATFORMS, vnd } from "@/lib/format";
import { siteUrl } from "@/lib/mail";
import { productPath } from "@/lib/slug";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const list = await fakeDeals({ limit: 30 });
  const title = "Giảm giá ảo: món ghi giảm sâu nhưng giá như mọi ngày";
  const description = `Những món trên Shopee, Lazada, TikTok Shop ghi giảm từ ${FAKE_MIN_CLAIM}% nhưng giá hiện tại gần như bằng giá thường ngày theo lịch sử giá Săn Deal ghi nhận${list.length ? ` – ${list.length} món đang như vậy` : ""}.`;
  return {
    title,
    description,
    alternates: { canonical: "/giam-gia-ao" },
    openGraph: { title, description },
    robots: list.length < 3 ? { index: false, follow: true } : undefined,
  };
}


export default async function FakeDealsPage() {
  const list = await fakeDeals({ limit: 30 });
  const url = `${siteUrl()}/giam-gia-ao`;
  return (
    <>
      <Breadcrumbs items={[{ name: "Giảm giá ảo" }]} />
      <h1 className="page-title">Giảm giá ảo</h1>
      <p className="page-sub">
        Món ghi giảm từ {FAKE_MIN_CLAIM}% trở lên nhưng giá hiện tại chỉ rẻ hơn giá thường ngày của chính nó tối đa {FAKE_MAX_REAL}% (hoặc còn đắt hơn).
        Giá gạch không phải giá thật – hãy nhìn lịch sử giá trước khi mua.
      </p>
      <ShareButtons url={url} title="Những món ghi giảm sâu nhưng giá như mọi ngày" />

      {list.length ? (
        <section className="section" aria-labelledby="fake-list">
          <div className="section-head"><h2 id="fake-list"><Icon name="alert" size={20} /> {list.length} món đang “giảm” như vậy</h2></div>
          <ol className="srow-list fake-list">
            {list.map(({ p, claim, real, usual, low }) => (
              <li key={p.id}>
                <Link href={productPath(p)} className="thumb"><CardImage src={p.imageUrl} alt={p.name} /></Link>
                <Link href={productPath(p)} className="name">
                  {p.name}
                  <small>
                    {PLATFORMS[p.platform]?.label ?? p.platform} · giá thường ngày {vnd(usual)} · thấp nhất {vnd(low)}
                  </small>
                </Link>
                <span className="num">
                  <b>{vnd(p.price)}</b>
                  <span className="fake-claim">
                    {p.originalPrice && p.originalPrice > p.price ? <s>{vnd(p.originalPrice)}</s> : null}
                    <span className="fake-tag claim">ghi −{claim}%</span>
                  </span>
                  <span className="fake-tag real">{realLabel(real)}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <p className="data-intro">Hiện chưa thấy món nào ghi giảm sâu mà giá vẫn như mọi ngày. Trang tự cập nhật sau mỗi lần Săn Deal lấy giá.</p>
      )}

      <FollowBox title="Tuần nào cũng có món “giảm” ảo" text="Theo dõi Săn Deal để nhận bài bóc giá ảo mỗi tuần và tin báo khi món bạn cần giảm thật." />

      <section className="section roundup-faq" aria-labelledby="how-head">
        <details>
          <summary id="how-head">Cách tính</summary>
          <p>
            <b>Giá thường ngày</b> là mức giá món đó giữ lâu nhất trong tối đa 90 ngày Săn Deal theo dõi (trung vị theo thời gian) – cùng con số
            ở ô “Nên mua ngay hay chờ?” trên trang sản phẩm. Chỉ xét món đã theo dõi từ {FAKE_MIN_DAYS} ngày và đang ghi giảm từ {FAKE_MIN_CLAIM}% so với giá gạch.
            Món có trong danh sách khi giá hiện tại rẻ hơn giá thường ngày không quá {FAKE_MAX_REAL}%. Số liệu chỉ nói về giá đã ghi nhận, giá có thể đổi bất cứ lúc nào.
          </p>
        </details>
      </section>

      <section className="section" aria-labelledby="more-head">
        <div className="section-head"><h2 id="more-head">Xem thêm</h2></div>
        <nav className="chips wrap">
          <Link className="chip" href="/deal-hom-nay">Deal giảm thật hôm nay</Link>
          <Link className="chip" href="/nang-gia">Ai nâng giá trước sale?</Link>
          <Link className="chip" href="/kiem-tra-gia">Kiểm tra giá thật 1 món</Link>
          <Link className="chip" href="/bao-cao-gia">Báo cáo giá tuần</Link>
        </nav>
      </section>
    </>
  );
}

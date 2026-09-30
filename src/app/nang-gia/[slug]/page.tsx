import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CardImage } from "@/components/CardImage";
import { Icon } from "@/components/Icon";
import { ShareButtons } from "@/components/ShareButtons";
import { PLATFORMS, vnd } from "@/lib/format";
import { siteUrl } from "@/lib/mail";
import { GROUP_MIN, RAISE_PCT, raiseReport, saleBySlug, salePages, saleTitle, type GroupRate } from "@/lib/salepages";
import { productPath } from "@/lib/slug";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

const pctOf = (a: number, b: number) => Math.round((a / b - 1) * 100);
const dmy = (d: Date) => d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = saleBySlug((await params).slug);
  if (!s) return {};
  const t = saleTitle(s.event);
  const title = s.state === "upcoming" ? `Ai đang nâng giá trước ${t}?` : `Ai đã nâng giá trước ${t}?`;
  const description = `Tỉ lệ sản phẩm tăng giá trong 2 tuần trước ${t} trên Shopee, Lazada, TikTok Shop – theo shop, theo danh mục, tính từ lịch sử giá Săn Deal ghi nhận.`;
  return { title, description, alternates: { canonical: `/nang-gia/${s.slug}` }, openGraph: { title, description } };
}

function RateTable({ rows, caption, withPlatform }: { rows: GroupRate[]; caption: string; withPlatform?: boolean }) {
  return (
    <table className="table raise-table">
      <caption className="sr-only">{caption}</caption>
      <thead><tr><th>{withPlatform ? "Shop" : "Danh mục"}</th><th className="num">Món tăng giá</th><th className="num">Tỉ lệ</th></tr></thead>
      <tbody>
        {rows.map((g) => (
          <tr key={g.key}>
            <td>{g.label}{withPlatform && g.platform ? <span className="muted"> · {PLATFORMS[g.platform]?.label ?? g.platform}</span> : null}</td>
            <td className="num">{g.raised}/{g.total}</td>
            <td className="num"><span className="rate-bar" style={{ ["--w" as string]: `${Math.round(g.rate * 100)}%` }}>{Math.round(g.rate * 100)}%</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function RaisePage({ params }: Props) {
  const s = saleBySlug((await params).slug);
  if (!s) notFound();
  const t = saleTitle(s.event);
  const now = new Date();
  const r = await raiseReport(s.event, now);
  const pct = Math.round(r.rate * 100);
  const enough = r.total >= 10;
  const url = `${siteUrl()}/nang-gia/${s.slug}`;
  const heading = s.state === "upcoming" ? `Ai đang nâng giá trước ${t}?` : `Ai đã nâng giá trước ${t}?`;
  const windowText = s.state === "upcoming" ? "trong 14 ngày qua" : `trong 14 ngày trước ${t} (đến ${dmy(r.ref)})`;
  const others = salePages(now).filter((x) => x.slug !== s.slug);
  const shops = r.byShop.filter((g) => g.raised > 0).slice(0, 15);
  const cats = r.byCategory.slice(0, 15);

  return (
    <>
      <Breadcrumbs items={[{ name: "Lịch sale", href: "/lich-sale" }, { name: t, href: `/sale/${s.slug}` }, { name: "Nâng giá trước sale" }]} />
      <header className="raise-hero">
        <h1>{heading}</h1>
        {enough ? (
          <p className="raise-big">
            <b>{pct}%</b>
            <span>sản phẩm Săn Deal theo dõi tăng giá từ {Math.round(RAISE_PCT * 100)}% trở lên {windowText} · {r.raised.length}/{r.total} món</span>
          </p>
        ) : (
          <p className="data-intro">
            Chưa đủ dữ liệu: cần ít nhất 10 sản phẩm có giá từ 20 ngày trước {s.state === "upcoming" ? "hôm nay" : t} (hiện có {r.total}). Bảng sẽ tự cập nhật khi Săn Deal theo dõi đủ lâu.
          </p>
        )}
        <ShareButtons url={url} title={enough ? `${pct}% món tăng giá trước ${t} – xem ai nâng giá` : heading} />
      </header>

      <section className="section roundup-faq" aria-labelledby="how-head">
        <details>
          <summary id="how-head">Cách tính</summary>
          <p>
            Với mỗi sản phẩm có lịch sử giá đủ dài: <b>giá thường ngày</b> là giá phổ biến 14–30 ngày trước {s.state === "upcoming" ? "hôm nay" : "ngày sale"}.
            Món được tính là <b>tăng giá</b> khi giá cao nhất trong 14 ngày ngay trước đó cao hơn giá thường ngày từ {Math.round(RAISE_PCT * 100)}%.
            Tỉ lệ theo shop/danh mục chỉ hiện khi có từ {GROUP_MIN} món trở lên. Số liệu chỉ phản ánh các sản phẩm Săn Deal đang theo dõi,
            không đại diện cho toàn sàn; giá có thể tăng vì nhiều lý do (hết khuyến mãi cũ, đổi phân loại, chi phí nhập hàng…).
          </p>
        </details>
      </section>

      {enough && shops.length > 0 && (
        <section className="section" aria-labelledby="shop-head">
          <div className="section-head"><h2 id="shop-head"><Icon name="users" size={20} /> Theo shop</h2></div>
          <RateTable rows={shops} caption={`Tỉ lệ món tăng giá theo shop trước ${t}`} withPlatform />
        </section>
      )}
      {enough && cats.length > 0 && (
        <section className="section" aria-labelledby="cat-head">
          <div className="section-head"><h2 id="cat-head"><Icon name="grid" size={20} /> Theo danh mục</h2></div>
          <RateTable rows={cats} caption={`Tỉ lệ món tăng giá theo danh mục trước ${t}`} />
        </section>
      )}

      {r.raised.length > 0 && (
        <section className="section" aria-labelledby="list-head">
          <div className="section-head"><h2 id="list-head"><Icon name="alert" size={20} /> Các món tăng giá nhiều nhất</h2></div>
          <ol className="srow-list">
            {r.raised.slice(0, 30).map(({ product: p, base, peak, saleLow }) => (
              <li key={p.id}>
                <Link href={productPath(p)} className="thumb"><CardImage src={p.imageUrl} alt={p.name} /></Link>
                <Link href={productPath(p)} className="name">{p.name}<small>{PLATFORMS[p.platform]?.label}{p.shopName ? ` · ${p.shopName}` : ""} · giá thường ngày {vnd(base)}</small></Link>
                <span className="num">
                  <b>{vnd(peak)}</b>
                  <span className="up">+{pctOf(peak, base)}%</span>
                  {saleLow != null && (
                    <span className={saleLow <= base * 0.95 ? "down" : "up"}>ngày sale: {vnd(saleLow)}{saleLow > base * 0.95 ? " (không rẻ hơn giá cũ)" : ""}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="section" aria-labelledby="more-head">
        <div className="section-head"><h2 id="more-head">Xem thêm</h2></div>
        <nav className="chips wrap">
          <Link className="chip" href={`/sale/${s.slug}`}>{s.state === "past" ? `Tổng kết ${t}` : `${t}: đếm ngược & mã giảm`}</Link>
          {others.map((o) => <Link key={o.slug} className="chip" href={`/nang-gia/${o.slug}`}>Nâng giá trước {saleTitle(o.event)}</Link>)}
        </nav>
      </section>
    </>
  );
}

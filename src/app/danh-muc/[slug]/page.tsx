import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ViewToggle } from "@/components/ViewToggle";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PLATFORMS } from "@/lib/format";
import { categoryStats, listCategories, listDeals } from "@/lib/queries";
import { vnd } from "@/lib/format";
import { LoadMore } from "@/components/Personal";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 24;

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string; platform?: string }> };

async function findCategory(slug: string) {
  return (await listCategories()).find((c) => c.slug === slug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const cat = await findCategory((await params).slug);
  if (!cat) return {};
  const title = `Deal ${cat.name} giảm thật hôm nay – Shopee, Lazada, TikTok Shop`;
  const st = await categoryStats(cat.name);
  return {
    title,
    description: st.realCount
      ? `${st.realCount} sản phẩm ${cat.name.toLowerCase()} đang giảm thật, trung bình −${Math.round(st.avgDrop)}% so với giá 30 ngày, rẻ nhất ${vnd(st.cheapest!.price)}. Xem lịch sử giá trước khi mua.`
      : `${cat.count} sản phẩm ${cat.name.toLowerCase()} trên Shopee, Lazada, TikTok Shop, xếp theo mức giảm thật so với giá 30 ngày.`,
    alternates: { canonical: `/danh-muc/${cat.slug}` },
    openGraph: { title },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const cat = await findCategory(slug);
  if (!cat) notFound();
  const page = Math.max(1, Number(sp.page) || 1);
  const [{ items, total }, st] = await Promise.all([listDeals({ category: cat.name, platform: sp.platform, page, pageSize: PAGE_SIZE }), categoryStats(cat.name)]);
  const base = `/danh-muc/${slug}`;
  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ platform: sp.platform, ...patch })) if (v) q.set(k, v);
    return q.toString() ? `${base}?${q}` : base;
  };

  return (
    <>
      <Breadcrumbs items={[{ name: cat.name, href: `/danh-muc/${cat.slug}` }]} />
      <h1 className="page-title" style={{ marginTop: 0 }}>Deal {cat.name} giảm thật hôm nay</h1>
      <p className="page-sub">{total} sản phẩm, xếp theo điểm deal. Giá được so với lịch sử 30 ngày để loại giảm giá ảo.</p>
      {st.realCount > 0 && st.cheapest && st.deepest && (
        <p className="data-intro">
          Hôm nay có <b>{st.realCount}</b>/{st.total} sản phẩm {cat.name.toLowerCase()} đang <b>giảm thật</b> (rẻ hơn giá 30 ngày từ 5%), trung bình{" "}
          <b>−{Math.round(st.avgDrop)}%</b>{st.platforms > 1 ? ` trên ${st.platforms} sàn` : ""}. Rẻ nhất là <b>{vnd(st.cheapest.price)}</b> ({st.cheapest.name}); giảm sâu nhất là{" "}
          {st.deepest.name} <b>−{Math.round(st.deepest.realDropPct)}%</b>.
        </p>
      )}
      <nav className="chips" aria-label="Lọc theo sàn" style={{ marginBottom: 16 }}>
        <Link className="chip" href={href({ platform: undefined })} aria-current={!sp.platform}>Tất cả sàn</Link>
        {Object.entries(PLATFORMS).map(([k, v]) => (
          <Link key={k} className="chip" href={href({ platform: k })} aria-current={sp.platform === k}>
            <span className="dot" style={{ background: v.color }} aria-hidden="true" />{v.label}
          </Link>
        ))}
      </nav>
      <div className="results-bar">
        <p className="result-count">{total.toLocaleString("vi-VN")} deal</p>
        <ViewToggle />
      </div>
      <LoadMore
        initial={items}
        query={new URLSearchParams(Object.entries({ category: cat.name, platform: sp.platform ?? "" }).filter(([, v]) => v)).toString()}
        startPage={page + 1}
        hasMore={page < Math.ceil(total / PAGE_SIZE)}
        nextHref={href({ page: String(page + 1) })}
      />
    </>
  );
}

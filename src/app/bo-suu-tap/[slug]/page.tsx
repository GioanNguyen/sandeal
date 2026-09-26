import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ViewToggle } from "@/components/ViewToggle";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { collectionBySlug, isInSeason } from "@/lib/collections";
import { listDeals } from "@/lib/queries";
import { Icon } from "@/components/Icon";
import { LoadMore } from "@/components/Personal";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 24;
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = collectionBySlug((await params).slug);
  if (!c) return {};
  return { title: c.title, description: c.description, alternates: { canonical: `/bo-suu-tap/${c.slug}` }, openGraph: { title: c.title, description: c.description } };
}

export default async function CollectionPage({ params, searchParams }: Props) {
  const c = collectionBySlug((await params).slug);
  if (!c) notFound();
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const { items, total } = await listDeals({ ...c.filter, page, pageSize: PAGE_SIZE });
  const pages = Math.ceil(total / PAGE_SIZE);
  return (
    <>
      <Breadcrumbs items={[{ name: "Bộ sưu tập", href: "/bo-suu-tap" }, { name: c.title }]} />
      <section className="collection-hero">
        <Icon name={c.icon} size={28} />
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>{c.title}</h1>
          <p className="page-sub" style={{ margin: "4px 0 0" }}>{c.description}</p>
          {c.season && !isInSeason(c) && <p className="form-msg warn">Bộ sưu tập theo mùa, hiện chưa tới mùa. Danh sách vẫn cập nhật theo giá hiện tại.</p>}
        </div>
      </section>
      <div className="results-bar">
        <p className="result-count">{total} deal</p>
        <ViewToggle />
      </div>
      <LoadMore initial={items} query={`collection=${c.slug}`} startPage={page + 1} hasMore={page < pages} nextHref={`/bo-suu-tap/${c.slug}?page=${page + 1}`} />
    </>
  );
}

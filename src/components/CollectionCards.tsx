import Link from "next/link";
import { activeCollections } from "@/lib/collections";
import { listDeals } from "@/lib/queries";
import { Icon } from "./Icon";

/** Thẻ bộ sưu tập: tiêu đề, số deal đang có, 3 ảnh xem trước */
export async function CollectionCards({ limit = 6 }: { limit?: number }) {
  const cols = activeCollections().slice(0, limit);
  const data = await Promise.all(cols.map((c) => listDeals({ ...c.filter, pageSize: 3 })));
  const shown = cols.map((c, i) => ({ c, ...data[i] })).filter((x) => x.total > 0);
  if (!shown.length) return null;
  return (
    <section className="section" aria-labelledby="col-head">
      <div className="section-head">
        <h2 id="col-head"><Icon name="grid" size={22} /> Bộ sưu tập</h2>
        <Link href="/bo-suu-tap">Tất cả <Icon name="arrowRight" size={16} /></Link>
      </div>
      <div className="collections">
        {shown.map(({ c, items, total }) => (
          <Link key={c.slug} href={`/bo-suu-tap/${c.slug}`} className={`collection${c.season ? " seasonal" : ""}`}>
            <span className="col-thumbs" aria-hidden="true">
              {items.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p.id} src={p.imageUrl ?? ""} alt="" width={80} height={80} loading="lazy" />
              ))}
            </span>
            <span className="col-text">
              {c.season && <span className="live-badge">THEO MÙA</span>}
              <b>{c.title}</b>
              <span className="muted">{total} deal đang có</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

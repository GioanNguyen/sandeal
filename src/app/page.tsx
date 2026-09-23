import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PLATFORMS } from "@/lib/format";
import { DealCard } from "@/components/DealCard";
import { Icon } from "@/components/Icon";
import { VoucherTicket } from "@/components/VoucherTicket";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 24;
const DAY = 86_400_000;

const SORTS: Record<string, Prisma.ProductOrderByWithRelationInput> = {
  score: { dealScore: "desc" },
  drop: { realDropPct: "desc" },
  price: { price: "asc" },
  sold: { sold: "desc" },
};

type SP = Promise<Record<string, string | undefined>>;

export default async function Home({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const now = new Date();
  const where: Prisma.ProductWhereInput = {
    ...(sp.platform ? { platform: sp.platform } : {}),
    ...(sp.category ? { category: sp.category } : {}),
    ...(sp.q ? { name: { contains: sp.q } } : {}),
    ...(sp.min ? { realDropPct: { gte: Number(sp.min) } } : {}),
  };
  const isLanding = !sp.q && !sp.platform && !sp.category && !sp.min && page === 1;
  const activeVoucher = { OR: [{ endAt: null }, { endAt: { gte: now } }] };

  const [products, total, categories, voucherCount, realDeals, vouchers, best] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: SORTS[sp.sort ?? "score"] ?? SORTS.score,
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        prices: { where: { capturedAt: { gte: new Date(now.getTime() - 30 * DAY) } }, orderBy: { price: "asc" }, take: 1 },
      },
    }),
    prisma.product.count({ where }),
    prisma.product.findMany({ distinct: ["category"], select: { category: true }, where: { category: { not: null } } }),
    prisma.voucher.count({ where: activeVoucher }),
    prisma.product.count({ where: { realDropPct: { gte: 10 } } }),
    isLanding ? prisma.voucher.findMany({ where: activeVoucher, orderBy: { endAt: "asc" }, take: 8 }) : Promise.resolve([]),
    prisma.product.findFirst({ orderBy: { realDropPct: "desc" }, select: { realDropPct: true } }),
  ]);
  const pages = Math.ceil(total / PAGE_SIZE);
  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, page: undefined, ...patch })) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <>
      {isLanding ? (
        <section className="hero">
          <div style={{ position: "relative", zIndex: 1 }}>
            <span className="hero-eyebrow"><Icon name="shield" size={14} /> So với giá 30 ngày, không tin giá ảo</span>
            <h1>Chỉ săn deal giảm thật trên Shopee, Lazada, TikTok Shop</h1>
            <p className="hero-lead">Chúng tôi theo dõi lịch sử giá mỗi ngày để lọc ra món thật sự rẻ, kèm mã giảm giá còn hạn.</p>
            <div className="hero-actions">
              <a href="#deals" className="btn btn-light">Xem deal hot <Icon name="arrowRight" size={16} /></a>
              <Link href="/vouchers" className="btn btn-outline"><Icon name="ticket" size={16} /> Lấy mã giảm giá</Link>
            </div>
          </div>
          <div className="hero-stats">
            <div className="stat"><b>{realDeals.toLocaleString("vi-VN")}</b><span>deal rẻ hơn ≥10% so với 30 ngày</span></div>
            <div className="stat"><b>{voucherCount.toLocaleString("vi-VN")}</b><span>mã giảm giá còn hạn</span></div>
            <div className="stat"><b>3</b><span>sàn: Shopee, Lazada, TikTok Shop</span></div>
            <div className="stat"><b>-{Math.round(best?.realDropPct ?? 0)}%</b><span>mức giảm thật sâu nhất hôm nay</span></div>
          </div>
        </section>
      ) : (
        <>
          <h1 className="page-title">{sp.q ? `Kết quả cho “${sp.q}”` : "Deal hot"}</h1>
          <p className="page-sub">Xếp theo điểm deal: giảm thật so với giá 30 ngày, đánh giá và lượt bán.</p>
        </>
      )}

      {isLanding && vouchers.length > 0 && (
        <section className="section" aria-labelledby="v-head">
          <div className="section-head">
            <h2 id="v-head"><Icon name="clock" size={22} /> Mã sắp hết hạn</h2>
            <Link href="/vouchers">Xem tất cả <Icon name="arrowRight" size={16} /></Link>
          </div>
          <div className="tickets strip">
            {vouchers.map((v) => <VoucherTicket key={v.id} v={v} now={now} />)}
          </div>
        </section>
      )}

      <section className="section" id="deals" aria-labelledby="d-head">
        {isLanding && (
          <div className="section-head">
            <h2 id="d-head"><Icon name="flame" size={22} /> Deal hot hôm nay</h2>
          </div>
        )}
        <form className="toolbar" action="/">
          {sp.q && <input type="hidden" name="q" value={sp.q} />}
          <nav className="chips" aria-label="Lọc theo sàn">
            <Link className="chip" href={href({ platform: undefined })} aria-current={!sp.platform}>Tất cả sàn</Link>
            {Object.entries(PLATFORMS).map(([k, v]) => (
              <Link key={k} className="chip" href={href({ platform: k })} aria-current={sp.platform === k}>
                <span className="dot" style={{ background: v.color }} aria-hidden="true" />{v.label}
              </Link>
            ))}
          </nav>
          {sp.platform && <input type="hidden" name="platform" value={sp.platform} />}
          <div className="toolbar-fields">
          <div className="field">
            <label htmlFor="category">Danh mục</label>
            <select id="category" className="select" name="category" defaultValue={sp.category ?? ""}>
              <option value="">Tất cả</option>
              {categories.map((c) => <option key={c.category} value={c.category!}>{c.category}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="min">Mức giảm thật</label>
            <select id="min" className="select" name="min" defaultValue={sp.min ?? ""}>
              <option value="">Bất kỳ</option>
              <option value="10">Từ 10%</option>
              <option value="20">Từ 20%</option>
              <option value="30">Từ 30%</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="sort">Sắp xếp</label>
            <select id="sort" className="select" name="sort" defaultValue={sp.sort ?? "score"}>
              <option value="score">Điểm deal cao nhất</option>
              <option value="drop">Giảm thật nhiều nhất</option>
              <option value="price">Giá thấp nhất</option>
              <option value="sold">Bán chạy nhất</option>
            </select>
          </div>
          <div className="field field-submit">
            <button className="btn btn-primary" type="submit"><Icon name="sliders" size={16} /> Áp dụng</button>
          </div>
          </div>
        </form>

        <p className="result-count">{total.toLocaleString("vi-VN")} sản phẩm</p>
        {products.length > 0 ? (
          <div className="grid">
            {products.map((p) => (
              <DealCard key={p.id} p={p} isLowest={p.prices[0] != null && p.price <= p.prices[0].price && p.realDropPct >= 5} />
            ))}
          </div>
        ) : (
          <div className="empty">Không có deal nào khớp bộ lọc. Thử bỏ bớt điều kiện nhé.</div>
        )}
        {pages > 1 && (
          <nav className="pager" aria-label="Phân trang">
            {page > 1 && <Link className="btn btn-ghost" href={href({ page: String(page - 1) })}>← Trước</Link>}
            <span className="muted">Trang {page}/{pages}</span>
            {page < pages && <Link className="btn btn-ghost" href={href({ page: String(page + 1) })}>Sau →</Link>}
          </nav>
        )}
      </section>
    </>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { LinkCheckForm } from "@/components/LinkCheckForm";
import { Countdown } from "@/components/Countdown";
import { nextSale } from "@/lib/sales";
import { PLATFORMS } from "@/lib/format";
import { homeStats, justDropped, listActiveVouchers, listCategories, listDeals } from "@/lib/queries";
import { UrgencyTimer } from "@/components/UrgencyTimer";
import { agoShort } from "@/components/DealCard";
import { vnd } from "@/lib/format";
import { ForYou, LoadMore, RecentlyViewed } from "@/components/Personal";
import { CollectionCards } from "@/components/CollectionCards";
import { PRICE_BANDS } from "@/lib/collections";
import { Icon } from "@/components/Icon";
import { VoucherTicket } from "@/components/VoucherTicket";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 24;

type SP = Promise<Record<string, string | undefined>>;

export default async function Home({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  // Người dùng dán link sản phẩm vào ô tìm kiếm -> chuyển sang kiểm tra giá
  if (sp.q && /(shopee|shope\.ee|shp\.ee|lazada|tiktok)\./i.test(sp.q)) redirect(`/kiem-tra-gia?url=${encodeURIComponent(sp.q)}`);
  const page = Math.max(1, Number(sp.page) || 1);
  const now = new Date();
  const isLanding = !sp.q && !sp.platform && !sp.category && !sp.min && !sp.max && page === 1;

  const [{ items, total }, categories, stats, vouchers, dropped] = await Promise.all([
    listDeals({ q: sp.q, platform: sp.platform, category: sp.category, minDrop: Number(sp.min) || undefined, maxPrice: Number(sp.max) || undefined, sort: sp.sort, page, pageSize: PAGE_SIZE }),
    listCategories(),
    homeStats(),
    isLanding ? listActiveVouchers({ limit: 8 }) : Promise.resolve([]),
    isLanding ? justDropped(24, 12) : Promise.resolve([]),
  ]);
  const pages = Math.ceil(total / PAGE_SIZE);
  // Query cho "tải thêm" (giữ bộ lọc hiện tại, bỏ page)
  const moreQuery = new URLSearchParams(Object.entries({ q: sp.q, platform: sp.platform, category: sp.category, min: sp.min, max: sp.max, sort: sp.sort }).filter(([, v]) => v) as [string, string][]).toString();
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
            <LinkCheckForm />
            <div className="hero-actions">
              <a href="#deals" className="btn btn-light">Xem deal hot <Icon name="arrowRight" size={16} /></a>
              <Link href="/vouchers" className="btn btn-outline"><Icon name="ticket" size={16} /> Lấy mã giảm giá</Link>
            </div>
          </div>
          <div className="hero-stats">
            <div className="stat"><b>{stats.realDeals.toLocaleString("vi-VN")}</b><span>deal rẻ hơn ≥10% so với 30 ngày</span></div>
            <div className="stat"><b>{stats.voucherCount.toLocaleString("vi-VN")}</b><span>mã giảm giá còn hạn</span></div>
            <div className="stat"><b>3</b><span>sàn: Shopee, Lazada, TikTok Shop</span></div>
            <div className="stat"><b>-{Math.round(stats.best)}%</b><span>mức giảm thật sâu nhất hôm nay</span></div>
          </div>
        </section>
      ) : (
        <>
          <h1 className="page-title">{sp.q ? `Kết quả cho “${sp.q}”` : "Deal hot"}</h1>
          <p className="page-sub">Xếp theo điểm deal: giảm thật so với giá 30 ngày, đánh giá và lượt bán.</p>
        </>
      )}

      {isLanding && (
        <Link href="/cach-hoat-dong" className="trust-bar" aria-label="Cách Săn Deal hoạt động">
          <span><Icon name="refresh" size={16} /> Cập nhật giá mỗi 2 giờ</span>
          <span><Icon name="shield" size={16} /> So với giá 30 ngày, không tin giá gốc</span>
          <span><Icon name="scale" size={16} /> Xếp hạng theo giá, không theo hoa hồng</span>
          <span className="trust-more">Cách chúng tôi tính <Icon name="arrowRight" size={14} /></span>
        </Link>
      )}

      {isLanding && (() => {
        const sale = nextSale(now, true);
        const live = now >= sale.start;
        const soon = !live && sale.start.getTime() - now.getTime() < 24 * 3_600_000;
        return (
          <Link href="/lich-sale" className={`sale-bar${live ? " is-live" : soon ? " is-soon" : ""}`}>
            {live ? <span className="live-badge"><span className="pulse-dot" aria-hidden="true" /> ĐANG DIỄN RA</span> : <Icon name="calendar" size={18} />}
            <span><b>{sale.name}</b> {live ? "kết thúc sau" : "còn"}</span>
            {live || soon ? (
              <UrgencyTimer end={(live ? sale.end : sale.start).toISOString()} start={live ? sale.start.toISOString() : null} label="" endedLabel="Đã kết thúc" bar={live} />
            ) : (
              <Countdown to={sale.start.toISOString()} until={sale.end.toISOString()} compact />
            )}
            <span className="sale-bar-cta">{live ? "Săn ngay" : "Xem lịch sale"} <Icon name="arrowRight" size={14} /></span>
          </Link>
        );
      })()}

      {isLanding && dropped.length > 0 && (
        <section className="section" aria-labelledby="drop-head">
          <div className="section-head">
            <h2 id="drop-head"><span className="live-badge"><span className="pulse-dot" aria-hidden="true" /> MỚI</span> Vừa giảm giá trong 24 giờ</h2>
            <a href="#deals">Xem tất cả <Icon name="arrowRight" size={16} /></a>
          </div>
          <div className="drop-strip">
            {dropped.map((p) => (
              <Link key={p.id} href={`/product/${p.id}`} className="drop-item">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.imageUrl ?? ""} alt="" width={64} height={64} loading="lazy" />
                <span className="drop-info">
                  <span className="drop-name">{p.name}</span>
                  <b className="price" style={{ fontSize: 16 }}>{vnd(p.price)}</b>
                  <span className="drop-meta"><span className="save">−{Math.round(p.realDropPct)}%</span> · {p.droppedAt ? agoShort(p.droppedAt) : ""}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {isLanding && (
        <nav className="tools" aria-label="Công cụ săn deal">
          <Link href="/kiem-tra-gia" className="tool"><Icon name="link" size={22} /><b>Kiểm tra giá thật</b><span>Dán link, biết ngay giảm thật hay ảo</span></Link>
          <Link href="/tinh-gia" className="tool"><Icon name="calculator" size={22} /><b>Tính giá cuối cùng</b><span>Ghép mã giảm, freeship, hoàn xu tốt nhất</span></Link>
          <Link href="/so-sanh" className="tool"><Icon name="scale" size={22} /><b>So sánh giữa các sàn</b><span>Cùng món, sàn nào rẻ hơn</span></Link>
          <Link href="/tien-ich" className="tool"><Icon name="puzzle" size={22} /><b>Tiện ích Chrome</b><span>Xem lịch sử giá ngay trên Shopee</span></Link>
        </nav>
      )}

      {isLanding && <RecentlyViewed />}
      {isLanding && <ForYou />}

      {isLanding && (
        <section className="section" aria-labelledby="band-head">
          <div className="section-head"><h2 id="band-head"><Icon name="tag" size={22} /> Săn theo tầm giá</h2></div>
          <nav className="bands" aria-label="Deal theo tầm giá">
            {PRICE_BANDS.map((b) => (
              <Link key={b.max} href={`/?max=${b.max}&sort=drop#deals`} className="band">
                <small>Deal</small>
                <b>{b.label}</b>
                <span>giảm thật, xếp theo mức giảm</span>
              </Link>
            ))}
          </nav>
        </section>
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

      {isLanding && <CollectionCards />}

      {isLanding && categories.length > 0 && (
        <section className="section" aria-labelledby="c-head">
          <div className="section-head"><h2 id="c-head"><Icon name="tag" size={22} /> Danh mục</h2></div>
          <nav className="chips wrap" aria-label="Danh mục">
            {categories.map((c) => (
              <Link key={c.slug} className="chip" href={`/danh-muc/${c.slug}`}>{c.name} <span className="muted">{c.count}</span></Link>
            ))}
          </nav>
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
                {categories.map((c) => <option key={c.slug} value={c.name}>{c.name}</option>)}
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
              <label htmlFor="max">Tầm giá</label>
              <select id="max" className="select" name="max" defaultValue={sp.max ?? ""}>
                <option value="">Mọi mức giá</option>
                {PRICE_BANDS.map((b) => <option key={b.max} value={b.max}>{b.label}</option>)}
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
        <LoadMore key={`${moreQuery}|${page}`} initial={items} query={moreQuery} startPage={page + 1} hasMore={page < pages} nextHref={href({ page: String(page + 1) })} />
      </section>
    </>
  );
}

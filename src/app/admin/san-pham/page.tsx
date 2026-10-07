import Link from "next/link";
import { blockerText, canDelete, deleteBlockers } from "@/lib/deadlink";
import { redirect } from "next/navigation";
import { AdminTabs } from "@/components/AdminTabs";
import { CardImage } from "@/components/CardImage";
import { Icon } from "@/components/Icon";
import { PlatformBadge } from "@/components/PlatformBadge";
import { ProductAdminActions } from "@/components/ProductAdminActions";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { STALE_DAYS } from "@/lib/availability";
import { PLATFORMS, vnd } from "@/lib/format";
import { AUTO_CATEGORY, ISSUES, NO_CATEGORY, PAGE_SIZE, categoryOptions, categorySourceCounts, healthList, healthSummary, type HealthSort, type Issue } from "@/lib/producthealth";
import { CATEGORIES } from "@/lib/autocategory";
import { DataFillTools, ProductBulkBar } from "@/components/ProductBulkBar";
import { autoCategoryAi } from "@/worker/autocategory";
import { lookupPlatforms } from "@/worker/fillimages";
import { plainProductUrl } from "@/lib/links";
import { productPath } from "@/lib/slug";
import { imageGapCounts } from "@/lib/extqueue";

export const metadata = { title: "Tình trạng sản phẩm", robots: { index: false } };
export const dynamic = "force-dynamic";

type SP = { loc?: string; san?: string; q?: string; xep?: string; dm?: string; trang?: string };
const SORTS: { key: HealthSort; label: string }[] = [
  { key: "seen", label: "Thấy gần nhất" },
  { key: "views", label: "Xem nhiều (7 ngày)" },
  { key: "clicks", label: "Bấm mua nhiều (7 ngày)" },
  { key: "score", label: "Điểm deal" },
  { key: "new", label: "Mới thêm" },
];
const ISSUE_KEYS = new Set<string>(ISSUES.map((i) => i.key));
const INFO = Object.fromEntries(ISSUES.map((i) => [i.key, i])) as Record<Issue, (typeof ISSUES)[number]>;

/** "3 giờ trước", "2 ngày trước" */
function ago(at: Date | null, now: Date) {
  if (!at) return "chưa có";
  const m = Math.max(1, Math.round((now.getTime() - at.getTime()) / 60_000));
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} giờ trước` : `${Math.round(h / 24)} ngày trước`;
}

export default async function ProductHealthPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/san-pham");
  if (!isAdmin(user.email)) redirect("/admin");
  const sp = await searchParams;
  const now = new Date();
  const issue = sp.loc === "con-ban" ? "available" : sp.loc && ISSUE_KEYS.has(sp.loc) ? (sp.loc as Issue) : "all";
  const platform = sp.san && PLATFORMS[sp.san] ? sp.san : undefined;
  const sort = (SORTS.find((s) => s.key === sp.xep)?.key ?? "seen") as HealthSort;
  const q = (sp.q ?? "").slice(0, 300);
  const cats = await categoryOptions();
  const category = sp.dm === NO_CATEGORY || sp.dm === AUTO_CATEGORY || cats.some((c) => c.name === sp.dm) ? sp.dm : undefined;
  const [sum, res, srcCounts, gap] = await Promise.all([healthSummary(now), healthList({ issue, platform, q, sort, category, page: Number(sp.trang) || 1, now }), categorySourceCounts(), imageGapCounts()]);
  // Món nào xoá hẳn được (không có người theo dõi, nhắc sale, lượt bấm mua, đơn hàng, bài đã đăng)
  const blockers = await deleteBlockers(res.list.map((r) => r.p.id));
  const imgPlatforms = lookupPlatforms();
  const allCats = [...new Set([...CATEGORIES, ...cats.map((c) => c.name)])];

  const href = (patch: Partial<SP>) => {
    const u = new URLSearchParams();
    const next = { loc: sp.loc, san: platform, q: q || undefined, xep: sort === "seen" ? undefined : sort, dm: category, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) u.set(k, String(v));
    const s = u.toString();
    return s ? `/admin/san-pham?${s}` : "/admin/san-pham";
  };
  const staleSync = (d: Date | null) => !d || now.getTime() - d.getTime() > 12 * 3_600_000;
  const problems = sum.needsCheck;

  return (
    <>
      <AdminTabs current="/admin/san-pham" />
      <h1 className="page-title">Tình trạng sản phẩm</h1>
      <p className="page-sub">
        Kiểm tra món nào còn bán, món nào đã vắng trên sàn, món có dữ liệu lỗi (giá, link, ảnh). Món vắng quá {STALE_DAYS()} ngày so với lần đồng bộ gần nhất của sàn
        được tính là “không còn thấy”. Ẩn một món để gỡ khỏi mọi danh sách và trả 404 cho khách.
      </p>

      <div className="kpis kpis-4">
        <div className="kpi"><span>Tổng sản phẩm</span><b>{sum.total.toLocaleString("vi-VN")}</b></div>
        <div className="kpi"><span>Đang hiện trên web</span><b className="save">{sum.available.toLocaleString("vi-VN")}</b><small className="muted">{sum.total ? Math.round((sum.available / sum.total) * 100) : 0}% tổng số</small></div>
        <div className="kpi"><span>Không còn thấy trên sàn</span><b>{sum.counts.gone.toLocaleString("vi-VN")}</b><small className="muted">đã ẩn: {sum.counts.hidden}</small></div>
        <div className="kpi"><span>Cần kiểm tra</span><b className={problems ? "ph-bad" : "save"}>{problems.toLocaleString("vi-VN")}</b><small className="muted">giá bất thường, giá đổi mạnh, link lỗi</small></div>
      </div>

      <section className="section panel" aria-labelledby="sync-head">
        <h2 id="sync-head"><Icon name="refresh" /> Đồng bộ theo sàn</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Sàn</th><th className="num">Sản phẩm</th><th className="num">Đang hiện</th><th className="num">Vắng trên sàn</th><th className="num">Đã ẩn</th><th>Lần đồng bộ gần nhất</th></tr></thead>
            <tbody>
              {sum.platforms.map((p) => (
                <tr key={p.platform}>
                  <td><Link href={href({ san: p.platform, trang: undefined })}><PlatformBadge platform={p.platform} inline /></Link></td>
                  <td className="num">{p.total.toLocaleString("vi-VN")}</td>
                  <td className="num">{p.available.toLocaleString("vi-VN")}</td>
                  <td className="num">{p.gone ? <Link href={href({ san: p.platform, loc: "gone", trang: undefined })}>{p.gone.toLocaleString("vi-VN")}</Link> : 0}</td>
                  <td className="num">{p.hidden}</td>
                  <td>
                    {ago(p.lastSync, now)}
                    {staleSync(p.lastSync) && <span className="vs vs-poor" style={{ marginLeft: 8 }}>quá 12 giờ chưa đồng bộ</span>}
                  </td>
                </tr>
              ))}
              {!sum.platforms.length && <tr><td colSpan={6} className="muted">Chưa có sản phẩm nào.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section panel" aria-labelledby="fill-head">
        <h2 id="fill-head"><Icon name="sparkles" /> Làm đầy dữ liệu</h2>
        <ul className="fill-stats">
          <li><b>{srcCounts.none.toLocaleString("vi-VN")}</b> món chưa có danh mục{srcCounts.none > 0 && <> · <Link href={href({ dm: NO_CATEGORY, loc: undefined, trang: undefined })}>xem</Link></>}</li>
          <li><b>{(srcCounts.auto + srcCounts.ai).toLocaleString("vi-VN")}</b> món được tự xếp (từ khoá {srcCounts.auto}, AI {srcCounts.ai}){srcCounts.auto + srcCounts.ai > 0 && <> · <Link href={href({ dm: AUTO_CATEGORY, loc: undefined, trang: undefined })}>xem lại</Link></>}</li>
          <li><b>{srcCounts.manual.toLocaleString("vi-VN")}</b> món gán danh mục tay</li>
          <li>
            <b>{gap.all.toLocaleString("vi-VN")}</b> món thiếu ảnh{gap.all > 0 && <> · <Link href={href({ loc: "no_image", dm: undefined, trang: undefined })}>xem</Link></>}
            {gap.all > 0 && (
              <span className="muted">
                {" "}– {gap.available.toLocaleString("vi-VN")} món đang bán, tiện ích mở được {gap.openable.toLocaleString("vi-VN")} món
                {gap.available > gap.openable ? ` (${(gap.available - gap.openable).toLocaleString("vi-VN")} món chỉ có link rút gọn: nhập lại CSV có cột “Link sản phẩm”)` : ""}
                {gap.all > gap.available ? `; ${(gap.all - gap.available).toLocaleString("vi-VN")} món đã vắng trên sàn / đã ẩn không cần ảnh` : ""}
              </span>
            )}
          </li>
        </ul>
        <p className="muted" style={{ fontSize: 14, margin: "0 0 10px" }}>
          Tự động mỗi giờ: xếp danh mục theo từ khoá trong tên{autoCategoryAi() ? ", món khó hỏi AI (Claude Haiku)" : " (chưa bật AI: thêm ANTHROPIC_API_KEY để xếp cả món khó)"}; lấy ảnh{" "}
          {imgPlatforms.size ? `qua API ${[...imgPlatforms].map((x) => PLATFORMS[x]?.label ?? x).join(", ")}` : "– chưa có nguồn tra cứu (cần SHOPEE_APP_ID, SHOPEE_SECRET của Shopee Affiliate Open API)"}. Tiện ích trình duyệt cũng tự bổ sung ảnh và danh mục khi có người xem trang sàn.
          Danh mục gán tay không bị ghi đè.
        </p>
        <DataFillTools canFetchImages={imgPlatforms.size > 0} />
        <p className="muted" style={{ fontSize: 14, margin: "12px 0 0" }}>
          <b>Chưa có API?</b> Dùng <Link href="/tien-ich">tiện ích Săn Deal</Link> (bản 1.7.0 trở lên, đăng nhập web bằng tài khoản quản trị) › bấm biểu tượng tiện ích ›{" "}
          <b>Quản trị: cập nhật ảnh &amp; giá hàng loạt</b> › Bắt đầu. Tiện ích tự mở lần lượt từng món thiếu ảnh và món khách đang quan tâm mà giá đã cũ
          (món nhiều người xem trước) bằng link thường, mỗi món cách 30–60 giây, tối đa 80 món/giờ (không giới hạn trong ngày), tự dừng khi Shopee hỏi xác minh.
        </p>
      </section>

      <section className="section" aria-labelledby="list-head">
        <h2 id="list-head" className="sr-only">Danh sách sản phẩm</h2>
        <nav className="chips wrap ph-filters" aria-label="Lọc theo tình trạng">
          <Link className="chip" href={href({ loc: undefined, trang: undefined })} aria-current={issue === "all" ? "page" : undefined}>Tất cả ({sum.total})</Link>
          <Link className="chip" href={href({ loc: "con-ban", trang: undefined })} aria-current={issue === "available" ? "page" : undefined}>Đang hiện ({sum.available})</Link>
          {ISSUES.map((i) => (
            <Link key={i.key} className={`chip ph-chip-${i.tone}`} href={href({ loc: i.key, trang: undefined })} aria-current={issue === i.key ? "page" : undefined} title={i.hint}>
              {i.label} ({sum.counts[i.key]})
            </Link>
          ))}
        </nav>
        {issue !== "all" && issue !== "available" && <p className="muted" style={{ fontSize: 14, margin: "4px 0 12px" }}>{INFO[issue].hint}</p>}

        <form className="row ph-search" action="/admin/san-pham">
          {sp.loc && <input type="hidden" name="loc" value={sp.loc} />}
          <label className="sr-only" htmlFor="ph-q">Tìm sản phẩm</label>
          <input id="ph-q" name="q" className="input" defaultValue={q} placeholder="Tên, shop, mã món, mã trên sàn hoặc dán link Shopee/Lazada/TikTok/Săn Deal" />
          <label className="sr-only" htmlFor="ph-san">Sàn</label>
          <select id="ph-san" name="san" className="input" defaultValue={platform ?? ""}>
            <option value="">Mọi sàn</option>
            {Object.entries(PLATFORMS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <label className="sr-only" htmlFor="ph-dm">Danh mục</label>
          <select id="ph-dm" name="dm" className="input" defaultValue={category ?? ""}>
            <option value="">Mọi danh mục</option>
            {cats.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.n})</option>)}
            {sum.counts.no_category > 0 && <option value={NO_CATEGORY}>Chưa có danh mục ({sum.counts.no_category})</option>}
            {srcCounts.auto + srcCounts.ai > 0 && <option value={AUTO_CATEGORY}>Danh mục tự xếp – xem lại ({srcCounts.auto + srcCounts.ai})</option>}
          </select>
          <label className="sr-only" htmlFor="ph-xep">Sắp xếp</label>
          <select id="ph-xep" name="xep" className="input" defaultValue={sort}>
            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button className="btn btn-primary">Lọc</button>
          {(q || platform || sp.xep || category) && <Link className="btn btn-ghost" href={href({ q: undefined, san: undefined, xep: undefined, dm: undefined, trang: undefined })}>Bỏ lọc</Link>}
        </form>

        <p className="muted" style={{ fontSize: 14 }}>
          {res.total.toLocaleString("vi-VN")} món{res.total > PAGE_SIZE ? ` · trang ${res.page}/${res.pages}` : ""}
        </p>

        {res.list.length > 0 && <ProductBulkBar total={res.total} filter={{ loc: sp.loc, san: platform, q: q || undefined, dm: category }} categories={allCats} />}

        {res.list.length ? (
          <ul className="ph-list">
            {res.list.map(({ p, available, views7, clicks7, watchers, issues }) => (
              <li key={p.id} className={p.hidden ? "is-hidden" : !available ? "is-gone" : undefined}>
                <label className="ph-check"><input type="checkbox" form="bulk" name="id" value={p.id} aria-label={`Chọn ${p.name}`} /></label>
                <Link href={productPath(p)} className="ph-thumb" target="_blank"><CardImage src={p.imageUrl} alt={p.name} /></Link>
                <div className="ph-main">
                  <Link href={productPath(p)} target="_blank" className="ph-name">{p.name}</Link>
                  <div className="ph-meta">
                    <PlatformBadge platform={p.platform} inline />
                    <span>#{p.id}</span>
                    <span>mã sàn {p.externalId}</span>
                    {p.shopName && <span>{p.shopName}</span>}
                    {p.category && <span>{p.category}{p.categorySource === "auto" ? <em className="cat-src"> · tự xếp</em> : p.categorySource === "ai" ? <em className="cat-src"> · AI xếp</em> : null}</span>}
                    {p.priceSource === "ext" && <span title="Giá do người dùng tiện ích ghi nhận">giá từ tiện ích</span>}
                  </div>
                  <div className="ph-issues">
                    {!issues.length && <span className="vs vs-good"><Icon name="check" size={13} /> Bình thường</span>}
                    {issues.map((k) => <span key={k} className={`ph-tag ph-${INFO[k].tone}`} title={INFO[k].hint}>{INFO[k].label}</span>)}
                    {p.hidden && p.hiddenReason && <span className="muted"> · lý do: {p.hiddenReason}</span>}
                  </div>
                  <ProductAdminActions id={p.id} hidden={p.hidden} deletable={canDelete(blockers.get(p.id))} keepReason={blockers.get(p.id) ? blockerText(blockers.get(p.id)!) : ""} />
                </div>
                <div className="ph-nums">
                  <b>{vnd(p.price)}</b>
                  {p.originalPrice && p.originalPrice > p.price ? <s className="muted">{vnd(p.originalPrice)}</s> : null}
                  <span className="muted">thấy {ago(p.lastSeenAt, now)}</span>
                  <span className="muted">{views7} xem · {clicks7} bấm mua · {watchers} theo dõi</span>
                  {(() => {
                    const plain = plainProductUrl(p);
                    const label = PLATFORMS[p.platform]?.label ?? "sàn";
                    return (
                      <span className="ph-links">
                        <a className="ph-go" href={plain.url} target="_blank" rel="noopener noreferrer nofollow" title={plain.exact ? "Link sản phẩm thường – không tạo lượt bấm affiliate" : "Chưa có link sản phẩm thường: tìm theo tên trên sàn"}>
                          {plain.exact ? `Mở trên ${label}` : `Tìm trên ${label}`} <Icon name="external" size={13} />
                        </a>
                        <a className="ph-aff" href={p.affiliateUrl} target="_blank" rel="noopener noreferrer nofollow" title="Link tiếp thị liên kết – chỉ mở khi cần kiểm tra link có chạy không">
                          Link affiliate
                        </a>
                      </span>
                    );
                  })()}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">Không có món nào khớp bộ lọc.</div>
        )}

        {res.pages > 1 && (
          <nav className="pager" aria-label="Phân trang">
            {res.page > 1 && <Link className="btn btn-ghost btn-sm" href={href({ trang: String(res.page - 1) })}>← Trang trước</Link>}
            <span className="muted">Trang {res.page}/{res.pages}</span>
            {res.page < res.pages && <Link className="btn btn-ghost btn-sm" href={href({ trang: String(res.page + 1) })}>Trang sau →</Link>}
          </nav>
        )}
      </section>
    </>
  );
}

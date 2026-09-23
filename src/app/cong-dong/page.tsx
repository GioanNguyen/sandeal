import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { leaderboard, listPosts } from "@/lib/community";
import { PLATFORMS, vnd } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { PlatformBadge } from "@/components/PlatformBadge";
import { VoteBox } from "@/components/VoteBox";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Cộng đồng săn deal – deal hot do người dùng chia sẻ",
  description: "Deal Shopee, Lazada, TikTok Shop do cộng đồng tìm được và bình chọn. Chia sẻ deal của bạn để lên bảng xếp hạng thợ săn.",
  alternates: { canonical: "/cong-dong" },
};

function ago(d: Date) {
  const m = Math.max(1, Math.round((Date.now() - d.getTime()) / 60000));
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} giờ trước` : `${Math.round(h / 24)} ngày trước`;
}

type SP = Promise<{ tab?: string; error?: string; posted?: string; existed?: string }>;

export default async function Community({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const tab = sp.tab === "new" ? "new" : sp.tab === "top" ? "top" : "hot";
  const user = await getCurrentUser();
  const admin = isAdmin(user?.email);
  const [list, board] = await Promise.all([
    tab === "top" ? Promise.resolve([]) : listPosts({ sort: tab, includeHidden: admin, viewerId: user?.id }),
    leaderboard(tab === "top" ? 30 : 5),
  ]);

  return (
    <>
      <h1 className="page-title">Cộng đồng săn deal</h1>
      <p className="page-sub">Deal do người dùng tìm được. Bình chọn để đẩy deal tốt lên đầu, chia sẻ deal để lên bảng xếp hạng.</p>

      <div className="community">
        <div>
          {user ? (
            <form className="panel share-form" method="post" action="/api/posts">
              <h2><Icon name="send" /> Chia sẻ deal bạn vừa tìm được</h2>
              <div className="field">
                <label htmlFor="s-url">Link sản phẩm</label>
                <input id="s-url" className="input" name="url" required placeholder="Dán link Shopee, Lazada, TikTok Shop…" />
              </div>
              <div className="field">
                <label htmlFor="s-note">Vì sao đây là deal tốt? (không bắt buộc)</label>
                <input id="s-note" className="input" name="note" maxLength={280} placeholder="VD: rẻ hơn 30% so với tháng trước, áp thêm mã 50K" />
              </div>
              <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hp" />
              <button className="btn btn-primary" type="submit"><Icon name="send" size={16} /> Chia sẻ</button>
            </form>
          ) : (
            <div className="panel row" style={{ justifyContent: "space-between", gap: 12 }}>
              <span><b>Tìm được deal ngon?</b> <span className="muted">Đăng nhập để chia sẻ và bình chọn.</span></span>
              <Link className="btn btn-primary" href="/login?next=/cong-dong">Đăng nhập</Link>
            </div>
          )}
          {sp.error && <p className="form-msg warn" role="alert"><Icon name="alert" size={16} /> {sp.error}</p>}
          {sp.posted && <p className="form-msg save" role="status"><Icon name="check" size={16} /> Đã chia sẻ, cảm ơn bạn!</p>}
          {sp.existed && <p className="form-msg warn" role="status"><Icon name="alert" size={16} /> Deal này đã có người chia sẻ, bạn có thể bình chọn cho nó.</p>}

          <nav className="tabs" aria-label="Sắp xếp">
            <Link href="/cong-dong" aria-current={tab === "hot" ? "page" : undefined}><Icon name="flame" size={16} /> Đang hot</Link>
            <Link href="/cong-dong?tab=new" aria-current={tab === "new" ? "page" : undefined}><Icon name="clock" size={16} /> Mới nhất</Link>
            <Link href="/cong-dong?tab=top" aria-current={tab === "top" ? "page" : undefined}><Icon name="trophy" size={16} /> Bảng xếp hạng</Link>
          </nav>

          {tab === "top" ? (
            <Leaderboard board={board} full />
          ) : list.length === 0 ? (
            <div className="empty" style={{ marginTop: 16 }}>Chưa có deal nào được chia sẻ. Hãy là người đầu tiên!</div>
          ) : (
            <ul className="post-list">
              {list.map((r) => (
                <li key={r.post.id} className={`post${r.post.hidden ? " hidden-post" : ""}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.product.imageUrl ?? ""} alt="" width={88} height={88} />
                  <div className="post-main">
                    <div className="row" style={{ gap: 8 }}>
                      <PlatformBadge platform={r.product.platform} inline />
                      <span className="muted" style={{ fontSize: 13 }}>{r.author} · {ago(r.post.createdAt)}</span>
                      {r.post.hidden && <span className="status">Đã ẩn</span>}
                    </div>
                    <Link href={`/product/${r.product.id}`} className="watch-name">{r.product.name}</Link>
                    {r.post.note && <p className="post-note">“{r.post.note}”</p>}
                    <div className="row" style={{ gap: 10 }}>
                      <span className="price" style={{ fontSize: 18 }}>{vnd(r.product.price)}</span>
                      {r.product.realDropPct >= 1 && <span className="real-drop"><Icon name="shield" size={13} /> Giảm thật {Math.round(r.product.realDropPct)}%</span>}
                    </div>
                  </div>
                  <div className="post-side">
                    <VoteBox productId={r.product.id} loggedIn={!!user} initial={{ up: r.ups, down: r.downs, mine: r.mine }} />
                    <a className="btn btn-ghost btn-sm" href={`/go/${r.product.id}`} target="_blank" rel="nofollow sponsored noopener">
                      Tới {PLATFORMS[r.product.platform]?.label} <Icon name="external" size={13} />
                    </a>
                    {admin && (
                      <form method="post" action={`/api/admin/posts/${r.post.id}`}>
                        <button className="btn btn-ghost btn-sm">{r.post.hidden ? "Hiện lại" : "Ẩn bài"}</button>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {tab !== "top" && (
          <aside className="panel">
            <h2><Icon name="trophy" /> Thợ săn tháng này</h2>
            <Leaderboard board={board} />
            <Link href="/cong-dong?tab=top" className="muted" style={{ fontSize: 14 }}>Xem bảng xếp hạng →</Link>
          </aside>
        )}
      </div>
    </>
  );
}

function Leaderboard({ board, full = false }: { board: { id: number; name: string; deals: number; votes: number; points: number }[]; full?: boolean }) {
  if (!board.length) return <p className="muted">Chưa có ai trên bảng xếp hạng.</p>;
  return (
    <ol className={`board${full ? " full" : ""}`}>
      {board.map((b, i) => (
        <li key={b.id}>
          <span className={`rank r${i + 1}`}>{i + 1}</span>
          <span className="board-name">{b.name}</span>
          <span className="muted">{b.deals} deal · {b.votes >= 0 ? "+" : ""}{b.votes}</span>
          <b>{b.points} điểm</b>
        </li>
      ))}
    </ol>
  );
}

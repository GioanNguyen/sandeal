import Link from "next/link";
import { AdminTabs } from "@/components/AdminTabs";
import { and, desc, eq, gte } from "drizzle-orm";
import { redirect } from "next/navigation";
import { products, socialPosts, type Product } from "@/db/schema";
import { availableSql } from "@/lib/availability";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { db, ensureMigrated } from "@/lib/db";
import { POST_KINDS, type PostDraft } from "@/lib/fbposts";
import { productPath } from "@/lib/slug";
import { siteUrl } from "@/lib/mail";
import { Icon } from "@/components/Icon";
import { PostComposer } from "@/components/PostComposer";
import { ReelButtons } from "@/components/ReelButtons";
import { hasFfmpeg, REEL_CHANNEL, reelHours, reelsEnabled } from "@/worker/reels";
import { GIA_AO_CHANNEL, NANG_GIA_CHANNEL, giaAoEnabled, giaAoSchedule, nextGiaAoDraft } from "@/worker/giaao";
import { channels, draftsForProduct, lastPosted, pickDeals, raiseDraft, repostDays, roundupDraft } from "@/worker/social";

export const metadata = { title: "Đăng bài mạng xã hội", robots: { index: false } };
export const dynamic = "force-dynamic";

/** "3 giờ trước", "2 ngày trước" */
function ago(at: Date, now: Date) {
  const m = Math.max(1, Math.round((now.getTime() - at.getTime()) / 60_000));
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} giờ trước` : `${Math.round(h / 24)} ngày trước`;
}

export default async function SocialAdmin({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/dang-bai");
  if (!isAdmin(user.email)) redirect("/admin");
  await ensureMigrated();
  const sp = await searchParams;
  const now = new Date();
  const connected = channels();
  const canPost = connected.includes("facebook");

  // Sản phẩm để soạn bài: món chỉ định (?p=id hoặc link) + deal nên đăng + món điểm cao mới cập nhật
  const wanted = Number(String(sp.p ?? "").match(/(\d+)(?!.*\d)/)?.[1] ?? 0);
  const [picked, pool, one] = await Promise.all([
    pickDeals("facebook", 6, now, false),
    db.select().from(products).where(and(availableSql(), gte(products.lastSeenAt, new Date(now.getTime() - 3 * 86_400_000)))).orderBy(desc(products.dealScore)).limit(12),
    wanted ? db.select().from(products).where(eq(products.id, wanted)).limit(1) : Promise.resolve([] as Product[]),
  ]);
  const seen = new Set<number>();
  const list = [...one, ...picked, ...pool].filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true))).slice(0, 12);
  const perProduct = (await Promise.all(list.map(async (p) => ({ p, drafts: await draftsForProduct(p, now) })))).filter((x) => x.drafts.length);

  const [giaAo, ...others] = await Promise.all([nextGiaAoDraft(now), raiseDraft(now), roundupDraft(100_000, now), roundupDraft(200_000, now)]);
  const topic = [...(giaAo ? [giaAo.draft] : []), ...(others as (PostDraft | null)[])]
    .filter((d): d is PostDraft => !!d)
    .filter((d, i, arr) => arr.findIndex((x) => x.kind === d.kind && x.productIds.join() === d.productIds.join()) === i);
  const ga = giaAoSchedule();
  const dayName = (d: number) => (d === 0 ? "CN" : `thứ ${d + 1}`);
  const giaAoNote = giaAoEnabled() ? `Tự đăng ${ga.days.map(dayName).join(", ")} lúc ${ga.hour}h (lệch vài phút).` : "Chưa bật tự đăng (cần Trang Facebook; GIA_AO=0 đang tắt).";

  // Đánh dấu món đã đăng lên Trang trong N ngày để tránh đăng trùng
  const days = repostDays();
  const allIds = [...new Set([...perProduct.map((x) => x.p.id), ...topic.flatMap((d) => d.productIds)])];
  const posted = await lastPosted(allIds, "facebook", now, days);
  const postedGiaAo = await lastPosted(topic.flatMap((d) => d.productIds), GIA_AO_CHANNEL, now, 30);
  const postedNangGia = await lastPosted(topic.flatMap((d) => d.productIds), NANG_GIA_CHANNEL, now, 7);
  const topicPosted = (d: PostDraft) => {
    const m = d.kind === "boc-gia-ao" ? postedGiaAo : d.kind === "nang-gia" ? postedNangGia : null;
    if (!m) return postedOf(d.productIds);
    const hit = d.productIds.map((id) => m.get(id)).filter((x): x is NonNullable<typeof x> => !!x);
    if (!hit.length) return null;
    const last = hit.reduce((a, b) => (b.at > a.at ? b : a));
    return { text: `${hit.length}/${d.productIds.length} món đã có trong bài này ${ago(last.at, now)}`, url: last.externalId ? `https://www.facebook.com/${last.externalId}` : null };
  };
  const postedOf = (ids: number[]) => {
    const hit = ids.map((id) => posted.get(id)).filter((x): x is NonNullable<typeof x> => !!x);
    if (!hit.length) return null;
    const last = hit.reduce((a, b) => (b.at > a.at ? b : a));
    return {
      text: ids.length > 1 ? `${hit.length}/${ids.length} món đã đăng lên Trang trong ${days} ngày (gần nhất ${ago(last.at, now)})` : `Đã đăng lên Trang ${ago(last.at, now)}`,
      url: last.externalId ? `https://www.facebook.com/${last.externalId}` : null,
    };
  };
  const fresh = perProduct.filter((x) => !posted.has(x.p.id) || x.p.id === wanted);
  const done = perProduct.filter((x) => posted.has(x.p.id) && x.p.id !== wanted);

  const history = await db
    .select({ post: socialPosts, name: products.name })
    .from(socialPosts)
    .innerJoin(products, eq(products.id, socialPosts.productId))
    .orderBy(desc(socialPosts.postedAt))
    .limit(40);
  const hours = (process.env.SOCIAL_HOURS || "11,20").split(",").map((h) => `${h.trim()}h`).join(" và ");
  const reelsOn = reelsEnabled();
  const ffmpeg = await hasFfmpeg();
  const reelPosted = await lastPosted(fresh.map((x) => x.p.id), REEL_CHANNEL, now, days);
  const counts = new Map<string, number>();
  for (const x of [...topic, ...perProduct.flatMap((y) => y.drafts)]) counts.set(x.kind, (counts.get(x.kind) ?? 0) + 1);

  return (
    <>
      <AdminTabs current="/admin/dang-bai" />
      <h1 className="page-title">Soạn bài Facebook</h1>
      <p className="page-sub">
        Mỗi bài gồm <b>thân bài không có link</b> và <b>bình luận đầu chứa link</b> (bài có link ngoài thường bị Facebook giảm tiếp cận).
        {canPost ? ` Tự động đăng lên Trang lúc ${hours} mỗi ngày; nút “Đăng Trang Facebook” đăng ảnh + thân bài rồi tự bình luận đầu.` : " Chưa kết nối Trang Facebook: chép thân bài, tải ảnh, đăng tay rồi dán bình luận đầu."}
      </p>
      <p className="muted" style={{ fontSize: 14 }}>
        {POST_KINDS.length} mẫu: {POST_KINDS.map((k) => `${k.label}${counts.get(k.kind) ? ` (${counts.get(k.kind)})` : ""}`).join(" · ")}. Mẫu chỉ hiện khi món có đủ số liệu thật.
      </p>

      {!/^https:\/\/[^/]+\.[a-z]{2,}/i.test(siteUrl()) && (
        <p className="form-msg" role="alert">
          <b>Link trong bài đang dùng {siteUrl()}</b> – Facebook chỉ biến thành link bấm được khi là tên miền thật (vd https://sandealgiare.com).
          Đang chạy trên máy thì hãy soạn bài ở trang quản trị của web thật; trên VPS kiểm tra <code>SITE_URL</code> trong <code>/opt/sandeal/.env</code>.
        </p>
      )}

      <form className="row" style={{ gap: 8, margin: "12px 0 20px", flexWrap: "wrap" }} action="/admin/dang-bai">
        <label className="sr-only" htmlFor="pick">Mã sản phẩm hoặc link trang sản phẩm Săn Deal</label>
        <input id="pick" name="p" className="input" style={{ flex: "1 1 280px" }} placeholder="Soạn cho món khác: dán link trang sản phẩm Săn Deal hoặc mã số" defaultValue={sp.p ?? ""} />
        <button className="btn btn-ghost">Soạn bài</button>
      </form>

      {topic.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <div className="section-head"><h2>Bài theo chủ đề</h2></div>
          <div className="composers">
            {topic.map((d) => <PostComposer key={`${d.kind}-${d.productIds.join("-")}`} drafts={[d]} canPost={canPost} title={d.kind === "boc-gia-ao" ? `${d.label} – ${giaAoNote}` : d.label} posted={topicPosted(d)} />)}
          </div>
        </section>
      )}

      <div className="section-head"><h2>Từng sản phẩm <small className="muted">– chưa đăng lên Trang trong {days} ngày</small></h2></div>
      {fresh.length ? (
        <div className="composers">
          {fresh.map(({ p, drafts }) => (
            <PostComposer key={p.id} drafts={drafts} canPost={canPost} title={p.name} posted={postedOf([p.id])} />
          ))}
        </div>
      ) : (
        <div className="empty">
          {perProduct.length ? `Các món gợi ý đều đã đăng trong ${days} ngày qua – dán link món khác ở ô trên để soạn bài.` : "Chưa có món nào đủ số liệu cho các mẫu bài (cần lịch sử giá, giá gạch, mã giảm hoặc số lượng trong tên)."}
        </div>
      )}
      {done.length > 0 && (
        <details className="panel" style={{ marginTop: 16 }}>
          <summary><b>Đã đăng trong {days} ngày qua ({done.length} món)</b> – ẩn để tránh đăng trùng, bấm để xem</summary>
          <div className="composers" style={{ marginTop: 12 }}>
            {done.map(({ p, drafts }) => (
              <PostComposer key={p.id} drafts={drafts} canPost={canPost} title={p.name} posted={postedOf([p.id])} />
            ))}
          </div>
        </details>
      )}

      <section className="panel" style={{ marginTop: 24 }} id="reels">
        <h2><Icon name="sparkles" /> Reels (video dọc)</h2>
        <p className="muted" style={{ margin: "0 0 12px" }}>
          {!ffmpeg
            ? "Máy chủ chưa có ffmpeg nên chưa dựng được video. Ubuntu/Debian: sudo apt update && sudo apt install -y ffmpeg. AlmaLinux/Rocky: xem deploy/DEPLOY.md, mục Xử lý sự cố. Cài xong tải lại trang này sau khoảng 1 phút, không cần khởi động lại dịch vụ."
            : reelsOn
              ? `Tự dựng sẵn video lúc ${process.env.REELS_PREPARE_HOUR ?? 5}h20 và đăng Reel lúc ${reelHours().map((h) => `${h}h05`).join(", ")} mỗi ngày. Video ~13 giây: câu mở đầu → biểu đồ giá vẽ dần → kết luận, link mua ở bình luận đầu.`
              : process.env.REELS === "0"
                ? "Đang tắt (REELS=0). Vẫn xem thử và tải video được để đăng tay lên TikTok, Reels."
                : "Chưa kết nối Trang Facebook: xem thử và tải video để đăng tay."}
        </p>
        {ffmpeg && (
          <ul className="reel-list">
            {fresh.slice(0, 6).map(({ p }) => (
              <li key={p.id}>
                <div>
                  <Link href={productPath(p)}><b>{p.name}</b></Link>
                  {reelPosted.has(p.id) && <span className="muted"> · đã đăng Reel {ago(reelPosted.get(p.id)!.at, now)}</span>}
                </div>
                <ReelButtons productId={p.id} canPost={reelsOn} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" style={{ marginTop: 24 }}>
        <h2><Icon name="clock" /> Đã đăng gần đây</h2>
        {history.length ? (
          <table className="table">
            <thead><tr><th>Thời gian</th><th>Kênh</th><th>Sản phẩm</th><th>Kết quả</th></tr></thead>
            <tbody>
              {history.map(({ post, name }) => (
                <tr key={post.id}>
                  <td>{post.postedAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</td>
                  <td>{post.channel}</td>
                  <td><Link href={productPath({ id: post.productId, name })}>{name}</Link></td>
                  <td>
                    {post.error ? <span className="status">Lỗi: {post.error}</span> : <span className="status status-completed">Đã đăng</span>}
                    {!post.error && post.channel.startsWith("facebook") && post.channel !== REEL_CHANNEL && post.externalId && <> <a href={`https://www.facebook.com/${post.externalId}`} target="_blank" rel="noreferrer">Xem bài</a></>}
                    {!post.error && post.channel === REEL_CHANNEL && post.externalId && <> <a href={`https://www.facebook.com/reel/${post.externalId}`} target="_blank" rel="noreferrer">Xem Reel</a></>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">Chưa có bài nào.</p>
        )}
      </section>
    </>
  );
}

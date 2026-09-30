import Link from "next/link";
import { and, desc, eq, gte } from "drizzle-orm";
import { redirect } from "next/navigation";
import { products, socialPosts, type Product } from "@/db/schema";
import { availableSql } from "@/lib/availability";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { db, ensureMigrated } from "@/lib/db";
import { POST_KINDS, type PostDraft } from "@/lib/fbposts";
import { productPath } from "@/lib/slug";
import { Icon } from "@/components/Icon";
import { PostComposer } from "@/components/PostComposer";
import { channels, draftsForProduct, pickDeals, raiseDraft, roundupDraft } from "@/worker/social";

export const metadata = { title: "Đăng bài mạng xã hội", robots: { index: false } };
export const dynamic = "force-dynamic";

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

  const topic = (await Promise.all([raiseDraft(now), roundupDraft(100_000, now), roundupDraft(200_000, now)])).filter((d): d is PostDraft => !!d);

  const history = await db
    .select({ post: socialPosts, name: products.name })
    .from(socialPosts)
    .innerJoin(products, eq(products.id, socialPosts.productId))
    .orderBy(desc(socialPosts.postedAt))
    .limit(20);
  const hours = (process.env.SOCIAL_HOURS || "11,20").split(",").map((h) => `${h.trim()}h`).join(" và ");
  const counts = new Map<string, number>();
  for (const x of [...topic, ...perProduct.flatMap((y) => y.drafts)]) counts.set(x.kind, (counts.get(x.kind) ?? 0) + 1);

  return (
    <>
      <nav className="tabs" aria-label="Quản trị">
        <Link href="/admin">Thống kê</Link>
        <Link href="/admin/dang-bai" aria-current="page">Đăng bài</Link>
      </nav>
      <h1 className="page-title">Soạn bài Facebook</h1>
      <p className="page-sub">
        Mỗi bài gồm <b>thân bài không có link</b> và <b>bình luận đầu chứa link</b> (bài có link ngoài thường bị Facebook giảm tiếp cận).
        {canPost ? ` Tự động đăng lên Trang lúc ${hours} mỗi ngày; nút “Đăng Trang Facebook” đăng ảnh + thân bài rồi tự bình luận đầu.` : " Chưa kết nối Trang Facebook: chép thân bài, tải ảnh, đăng tay rồi dán bình luận đầu."}
      </p>
      <p className="muted" style={{ fontSize: 14 }}>
        10 mẫu: {POST_KINDS.map((k) => `${k.label}${counts.get(k.kind) ? ` (${counts.get(k.kind)})` : ""}`).join(" · ")}. Mẫu chỉ hiện khi món có đủ số liệu thật.
      </p>

      <form className="row" style={{ gap: 8, margin: "12px 0 20px", flexWrap: "wrap" }} action="/admin/dang-bai">
        <label className="sr-only" htmlFor="pick">Mã sản phẩm hoặc link trang sản phẩm Săn Deal</label>
        <input id="pick" name="p" className="input" style={{ flex: "1 1 280px" }} placeholder="Soạn cho món khác: dán link trang sản phẩm Săn Deal hoặc mã số" defaultValue={sp.p ?? ""} />
        <button className="btn btn-ghost">Soạn bài</button>
      </form>

      {topic.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <div className="section-head"><h2>Bài theo chủ đề</h2></div>
          <div className="composers">
            {topic.map((d) => <PostComposer key={`${d.kind}-${d.productIds.join("-")}`} drafts={[d]} canPost={canPost} title={d.label} />)}
          </div>
        </section>
      )}

      <div className="section-head"><h2>Từng sản phẩm</h2></div>
      {perProduct.length ? (
        <div className="composers">
          {perProduct.map(({ p, drafts }) => (
            <PostComposer key={p.id} drafts={drafts} canPost={canPost} title={p.name} />
          ))}
        </div>
      ) : (
        <div className="empty">Chưa có món nào đủ số liệu cho các mẫu bài (cần lịch sử giá, giá gạch, mã giảm hoặc số lượng trong tên).</div>
      )}

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
                  <td>{post.error ? <span className="status">Lỗi: {post.error}</span> : <span className="status status-completed">Đã đăng</span>}</td>
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

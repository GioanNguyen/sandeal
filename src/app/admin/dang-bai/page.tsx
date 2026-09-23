import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { products, socialPosts } from "@/db/schema";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { db, ensureMigrated } from "@/lib/db";
import { siteUrl } from "@/lib/mail";
import { buildCaption, shareUrl } from "@/lib/social";
import { Icon } from "@/components/Icon";
import { SocialComposer } from "@/components/SocialComposer";
import { channels, pickDeals } from "@/worker/social";

export const metadata = { title: "Đăng bài mạng xã hội", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SocialAdmin() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/dang-bai");
  if (!isAdmin(user.email)) redirect("/admin");
  await ensureMigrated();
  const connected = channels();
  const deals = await pickDeals("zalo", 6, new Date(), false);
  const history = await db
    .select({ post: socialPosts, name: products.name })
    .from(socialPosts)
    .innerJoin(products, eq(products.id, socialPosts.productId))
    .orderBy(desc(socialPosts.postedAt))
    .limit(20);
  const site = siteUrl();
  const hours = (process.env.SOCIAL_HOURS || "11,20").split(",").map((h) => `${h.trim()}h`).join(" và ");

  return (
    <>
      <nav className="tabs" aria-label="Quản trị">
        <Link href="/admin">Thống kê</Link>
        <Link href="/admin/dang-bai" aria-current="page">Đăng bài</Link>
      </nav>
      <h1 className="page-title">Đăng deal lên mạng xã hội</h1>
      <p className="page-sub">
        {connected.length
          ? `Tự động đăng lên ${connected.map((c) => (c === "facebook" ? "Trang Facebook" : "kênh Telegram")).join(", ")} lúc ${hours} mỗi ngày.`
          : "Chưa kết nối kênh nào để đăng tự động (xem hướng dẫn trong docs/huong-dan-dang-bai.md)."}{" "}
        Zalo, TikTok và nhóm Facebook: chép nội dung + tải ảnh bên dưới rồi đăng tay.
      </p>

      {deals.length ? (
        <div className="composers">
          {deals.map((p, i) => {
            const link = shareUrl(site, p.id, "zalo");
            return (
              <SocialComposer key={p.id} productId={p.id} name={p.name} caption={buildCaption(p, link, { variant: i })} link={link}
                image={`/product/${p.id}/opengraph-image`} connected={connected} />
            );
          })}
        </div>
      ) : (
        <div className="empty">Chưa có deal đủ tốt để đăng (điểm cao, giảm thật từ 10%, giá mới cập nhật).</div>
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
                  <td><Link href={`/product/${post.productId}`}>{name}</Link></td>
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

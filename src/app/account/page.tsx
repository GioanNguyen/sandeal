import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { products, watches } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Icon } from "@/components/Icon";
import { WatchList } from "@/components/WatchList";

export const metadata = { title: "Tài khoản", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ added?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { added } = await searchParams;
  const rows = await db
    .select({
      id: watches.id,
      targetPrice: watches.targetPrice,
      product: { id: products.id, name: products.name, price: products.price, imageUrl: products.imageUrl, platform: products.platform },
    })
    .from(watches)
    .innerJoin(products, eq(products.id, watches.productId))
    .where(eq(watches.userId, user.id))
    .orderBy(desc(watches.createdAt));

  return (
    <>
      <nav className="tabs" aria-label="Tài khoản">
        <Link href="/account" aria-current="page">Theo dõi giá</Link>
        <Link href="/account/so-thich">Sở thích & thông báo</Link>
      </nav>
      <div className="account-head">
        <div>
          <h1 className="page-title">Theo dõi giá của bạn</h1>
          <p className="page-sub">Email báo giảm giá gửi tới <b>{user.email}</b>, tối đa 1 email mỗi ngày cho mỗi sản phẩm.</p>
        </div>
        <form method="post" action="/api/logout">
          <button className="btn btn-ghost"><Icon name="logout" size={16} /> Đăng xuất</button>
        </form>
      </div>
      {added && (
        <p className="form-msg save" role="status" style={{ marginBottom: 16 }}>
          <Icon name="check" size={16} /> Đã xác nhận email và bắt đầu theo dõi sản phẩm.
        </p>
      )}
      <WatchList initial={rows} />
    </>
  );
}

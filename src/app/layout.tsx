import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Săn Deal – Deal tốt & mã giảm giá Shopee, Lazada, TikTok Shop",
  description: "Tổng hợp sản phẩm giảm giá thật, mã giảm giá và khuyến mãi từ Shopee, Lazada, TikTok Shop.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <header className="site">
          <div className="container">
            <Link href="/" className="logo">Săn Deal</Link>
            <nav>
              <Link href="/">Deal hot</Link>
              <Link href="/vouchers">Mã giảm giá</Link>
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
        <footer>
          Giá được cập nhật định kỳ và có thể thay đổi; kiểm tra giá cuối cùng trên sàn. Trang có sử dụng link tiếp thị liên kết.
        </footer>
      </body>
    </html>
  );
}

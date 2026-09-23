import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { siteUrl } from "@/lib/mail";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "Săn Deal – Deal giảm thật & mã giảm giá Shopee, Lazada, TikTok Shop", template: "%s | Săn Deal" },
  openGraph: { siteName: "Săn Deal", locale: "vi_VN", type: "website" },
  description: "Chỉ hiện deal giảm thật so với giá 30 ngày, kèm mã giảm giá còn hạn từ Shopee, Lazada, TikTok Shop.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fff7f2" },
    { media: "(prefers-color-scheme: dark)", color: "#111215" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser().catch(() => null);
  return (
    <html lang="vi">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/" className="logo" aria-label="Săn Deal – trang chủ">
              <span className="logo-mark"><Icon name="flame" size={18} /></span>
              Săn Deal
            </Link>
            <form action="/" className="header-search" role="search">
              <Icon name="search" />
              <label htmlFor="q" className="sr-only">Tìm sản phẩm</label>
              <input id="q" name="q" type="search" placeholder="Tìm tai nghe, kem chống nắng, nồi chiên…" />
            </form>
            <nav className="main-nav" aria-label="Điều hướng chính">
              <Link href="/" aria-label="Deal hot"><Icon name="flame" /><span>Deal hot</span></Link>
              <Link href="/vouchers" aria-label="Mã giảm giá"><Icon name="ticket" /><span>Mã giảm giá</span></Link>
              {user && isAdmin(user.email) && (
                <Link href="/admin" aria-label="Thống kê"><Icon name="chart" /><span>Thống kê</span></Link>
              )}
              {user ? (
                <Link href="/account" aria-label="Tài khoản"><Icon name="user" /><span>Tài khoản</span></Link>
              ) : (
                <Link href="/login" aria-label="Đăng nhập"><Icon name="user" /><span>Đăng nhập</span></Link>
              )}
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
        <footer className="site-footer">
          <div className="container">
            <span>© {new Date().getFullYear()} Săn Deal. Giá cập nhật định kỳ, vui lòng kiểm tra giá cuối cùng trên sàn.</span>
            <span>Trang có sử dụng link tiếp thị liên kết.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}

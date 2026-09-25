import Link from "next/link";
import { PLATFORMS } from "@/lib/format";
import { Icon } from "./Icon";
import { ThemeToggle } from "./ThemeToggle";
import { BackToTop } from "./BackToTop";

type Col = { title: string; links: { href: string; label: string }[] };

/**
 * Footer: 1 cột thương hiệu (giới thiệu ngắn + 3 cam kết + sàn hỗ trợ) và 3 cột liên kết theo nhóm.
 * Dải dưới cùng: bản quyền, công khai tiếp thị liên kết, đổi giao diện, lên đầu trang.
 */
export function SiteFooter({ loggedIn }: { loggedIn: boolean }) {
  const cols: Col[] = [
    {
      title: "Săn deal",
      links: [
        { href: "/", label: "Deal hot hôm nay" },
        { href: "/vouchers", label: "Mã giảm giá" },
        { href: "/lich-sale", label: "Lịch sale" },
        { href: "/top", label: "Top deal tuần này" },
        { href: "/bo-suu-tap", label: "Bộ sưu tập deal" },
      ],
    },
    {
      title: "Công cụ",
      links: [
        { href: "/kiem-tra-gia", label: "Kiểm tra giá thật" },
        { href: "/tinh-gia", label: "Máy tính giá cuối cùng" },
        { href: "/so-sanh", label: "So sánh giá các sàn" },
        { href: "/doan-gia", label: "Đoán giá mỗi ngày" },
        { href: "/tien-ich", label: "Tiện ích trình duyệt" },
      ],
    },
    {
      title: "Cộng đồng",
      links: [
        { href: "/cong-dong", label: "Deal thành viên đăng" },
        { href: "/cong-dong?tab=top", label: "Bảng xếp hạng thợ săn" },
        { href: "/da-luu", label: "Món đã lưu" },
        loggedIn ? { href: "/account", label: "Tài khoản & thông báo" } : { href: "/login", label: "Đăng nhập / đăng ký" },
        { href: "/cach-hoat-dong", label: "Cách hoạt động" },
      ],
    },
  ];

  return (
    <footer className="site-footer">
      <div className="container foot-main">
        <section className="foot-brand" aria-label="Về Săn Deal">
          <Link href="/" className="logo" aria-label="Săn Deal – trang chủ">
            <span className="logo-mark"><Icon name="flame" size={18} /></span>
            <span>Săn Deal</span>
          </Link>
          <p className="foot-pitch">Chỉ hiện deal giảm thật so với giá 30 ngày qua, kèm mã giảm giá còn hạn – để bạn mua đúng lúc, không mua hớ.</p>
          <ul className="foot-trust">
            <li><Icon name="shield" size={16} /> So với lịch sử giá thật, không tin giá gạch</li>
            <li><Icon name="refresh" size={16} /> Giá cập nhật nhiều lần mỗi ngày</li>
            <li><Icon name="external" size={16} /> Không bán hàng – mua trực tiếp trên sàn</li>
          </ul>
          <p className="foot-platforms-label">Theo dõi giá trên</p>
          <p className="foot-platforms">
            {Object.entries(PLATFORMS).map(([k, p]) => (
              <span key={k} className="foot-platform"><span className="dot" style={{ background: p.color }} aria-hidden="true" />{p.label}</span>
            ))}
          </p>
        </section>

        {cols.map((c) => (
          <nav key={c.title} className="foot-col" aria-label={c.title}>
            <h2>{c.title}</h2>
            <ul>
              {c.links.map((l) => (
                <li key={l.href}><Link href={l.href}>{l.label}</Link></li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="foot-bottom">
        <div className="container">
          <p className="foot-legal">
            © {new Date().getFullYear()} Săn Deal. Giá có thể đổi theo thời điểm – hãy xem giá cuối cùng trên sàn trước khi thanh toán.
            <br />
            Săn Deal dùng link tiếp thị liên kết: sàn trả hoa hồng cho chúng tôi khi bạn mua, giá bạn trả không đổi.
          </p>
          <div className="foot-actions">
            <span className="footer-theme"><ThemeToggle /></span>
            <BackToTop />
          </div>
        </div>
      </div>
    </footer>
  );
}

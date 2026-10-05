import Link from "next/link";

const TABS = [
  { href: "/admin", label: "Thống kê" },
  { href: "/admin/san-pham", label: "Sản phẩm" },
  { href: "/admin/nganh-hang", label: "Ngành hàng" },
  { href: "/admin/dang-bai", label: "Đăng bài" },
  { href: "/admin/huong-dan", label: "Hướng dẫn" },
  { href: "/admin/toc-do", label: "Tốc độ" },
  { href: "/admin/tim-kiem", label: "Tìm kiếm" },
];

export function AdminTabs({ current }: { current: string }) {
  return (
    <nav className="tabs admin-tabs" aria-label="Quản trị">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.href === current ? "page" : undefined}>{t.label}</Link>
      ))}
    </nav>
  );
}

import Link from "next/link";
import { siteUrl } from "@/lib/mail";
import { JsonLd } from "./JsonLd";

export type Crumb = { name: string; href?: string };

/**
 * Thanh "Trang chủ › Danh mục › Trang hiện tại" + dữ liệu BreadcrumbList cho Google
 * (Google hiện đường dẫn này thay cho URL trong kết quả tìm kiếm).
 * Mục cuối là trang hiện tại: không có link.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const all: Crumb[] = [{ name: "Trang chủ", href: "/" }, ...items];
  const site = siteUrl();
  const ld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: all.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      ...(c.href ? { item: `${site}${c.href}` } : {}),
    })),
  };
  return (
    <>
      <JsonLd data={ld} />
      <nav className="crumbs" aria-label="Breadcrumb">
        <ol>
          {all.map((c, i) => (
            <li key={i}>
              {c.href && i < all.length - 1 ? <Link href={c.href}>{c.name}</Link> : <span aria-current="page">{c.name}</span>}
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}

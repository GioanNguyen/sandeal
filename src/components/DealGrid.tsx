import Link from "next/link";
import type { DealRow } from "@/lib/queries";
import { DealCard } from "./DealCard";

export function DealGrid({ items }: { items: DealRow[] }) {
  if (items.length === 0) return <div className="empty">Không có deal nào khớp bộ lọc. Thử bỏ bớt điều kiện nhé.</div>;
  return (
    <div className="grid deal-grid">
      {items.map((p) => (
        <DealCard key={p.id} p={p} />
      ))}
    </div>
  );
}

export function Pager({ page, pages, href }: { page: number; pages: number; href: (p: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav className="pager" aria-label="Phân trang">
      {page > 1 && <Link className="btn btn-ghost" href={href(page - 1)} rel="prev">← Trước</Link>}
      <span className="muted">Trang {page}/{pages}</span>
      {page < pages && <Link className="btn btn-ghost" href={href(page + 1)} rel="next">Sau →</Link>}
    </nav>
  );
}

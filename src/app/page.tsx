import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PLATFORMS } from "@/lib/format";
import { DealCard } from "@/components/DealCard";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 24;

const SORTS: Record<string, Prisma.ProductOrderByWithRelationInput> = {
  score: { dealScore: "desc" },
  drop: { realDropPct: "desc" },
  price: { price: "asc" },
  sold: { sold: "desc" },
};

type SP = Promise<Record<string, string | undefined>>;

export default async function Home({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.ProductWhereInput = {
    ...(sp.platform ? { platform: sp.platform } : {}),
    ...(sp.category ? { category: sp.category } : {}),
    ...(sp.q ? { name: { contains: sp.q } } : {}),
    ...(sp.min ? { realDropPct: { gte: Number(sp.min) } } : {}),
  };
  const [products, total, categories] = await Promise.all([
    prisma.product.findMany({ where, orderBy: SORTS[sp.sort ?? "score"] ?? SORTS.score, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
    prisma.product.count({ where }),
    prisma.product.findMany({ distinct: ["category"], select: { category: true }, where: { category: { not: null } } }),
  ]);
  const pages = Math.ceil(total / PAGE_SIZE);
  const link = (p: number) => `/?${new URLSearchParams({ ...(sp as Record<string, string>), page: String(p) })}`;

  return (
    <>
      <h1>Deal hot hôm nay</h1>
      <p className="sub">Xếp theo điểm deal: giảm thật so với giá 30 ngày qua, không chỉ theo % giảm shop tự khai.</p>
      <form className="filters">
        <input name="q" placeholder="Tìm sản phẩm…" defaultValue={sp.q} />
        <select name="platform" defaultValue={sp.platform ?? ""}>
          <option value="">Tất cả sàn</option>
          {Object.entries(PLATFORMS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select name="category" defaultValue={sp.category ?? ""}>
          <option value="">Mọi danh mục</option>
          {categories.map((c) => <option key={c.category} value={c.category!}>{c.category}</option>)}
        </select>
        <select name="min" defaultValue={sp.min ?? ""}>
          <option value="">Mọi mức giảm thật</option>
          <option value="10">Giảm thật ≥ 10%</option>
          <option value="20">Giảm thật ≥ 20%</option>
          <option value="30">Giảm thật ≥ 30%</option>
        </select>
        <select name="sort" defaultValue={sp.sort ?? "score"}>
          <option value="score">Điểm deal cao nhất</option>
          <option value="drop">Giảm thật nhiều nhất</option>
          <option value="price">Giá thấp nhất</option>
          <option value="sold">Bán chạy nhất</option>
        </select>
        <button className="primary" type="submit">Lọc</button>
      </form>
      <p className="muted">{total.toLocaleString("vi-VN")} sản phẩm</p>
      <div className="grid">{products.map((p) => <DealCard key={p.id} p={p} />)}</div>
      {pages > 1 && (
        <div className="pager">
          {page > 1 && <Link className="btn" href={link(page - 1)}>← Trước</Link>}
          <span className="muted">Trang {page}/{pages}</span>
          {page < pages && <Link className="btn" href={link(page + 1)}>Sau →</Link>}
        </div>
      )}
    </>
  );
}

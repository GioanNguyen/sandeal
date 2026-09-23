import { collectionBySlug } from "./collections";
import type { DealFilter } from "./queries";

const nums = (s: string | null | undefined) => (s ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
const strs = (s: string | null | undefined) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 10);

/** Đọc bộ lọc deal từ query string (dùng chung cho trang và API tải thêm) */
export function filterFromParams(get: (k: string) => string | null | undefined): DealFilter {
  const col = get("collection") ? collectionBySlug(get("collection")!) : undefined;
  const base: DealFilter = col ? { ...col.filter } : {};
  const f: DealFilter = {
    ...base,
    q: get("q") || base.q,
    platform: get("platform") || base.platform,
    category: get("category") || base.category,
    minDrop: Number(get("min")) || base.minDrop,
    maxPrice: Number(get("max")) || base.maxPrice,
    sort: get("sort") || base.sort,
    page: Math.max(1, Number(get("page")) || 1),
  };
  const cats = strs(get("cats"));
  if (cats.length) f.categories = cats;
  const ex = nums(get("exclude"));
  if (ex.length) f.excludeIds = ex.slice(0, 50);
  return f;
}

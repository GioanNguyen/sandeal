/** "Làm đẹp & Sức khoẻ" -> "lam-dep-suc-khoe" */
export function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Đường dẫn sản phẩm dễ đọc: /product/tai-nghe-bluetooth-chong-on-anc-12 (số cuối là mã sản phẩm) */
export function productPath(p: { id: number; name?: string | null }) {
  const s = p.name ? slugify(p.name).slice(0, 70).replace(/-+$/, "") : "";
  return s ? `/product/${s}-${p.id}` : `/product/${p.id}`;
}

/** Lấy mã sản phẩm từ tham số đường dẫn ("tai-nghe-...-12" hoặc "12") */
export function productIdFromParam(param: string): number {
  const m = decodeURIComponent(param).match(/(?:^|-)(\d+)$/);
  return m ? Number(m[1]) : NaN;
}

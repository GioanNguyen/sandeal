export const vnd = (n: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);

export const PLATFORMS: Record<string, { label: string; color: string }> = {
  shopee: { label: "Shopee", color: "#ee4d2d" },
  lazada: { label: "Lazada", color: "#0f146d" },
  tiktok: { label: "TikTok Shop", color: "#111111" },
};

export const shortDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";

/**
 * Số đã bán kiểu sàn: 850 · 1,2k+ · 23k+ · 1tr+ · 1,5tr+ · 12tr+.
 * Làm tròn XUỐNG để dấu "+" đúng nghĩa "hơn" (số liệu từ sàn vốn là số ước lượng như "2tr+").
 */
export function soldText(n: number | null | undefined): string {
  const v = Math.floor(Number(n) || 0);
  if (v < 1000) return String(v);
  const fmt = (x: number, unit: string, decimals: number) => {
    const f = 10 ** decimals;
    return `${(Math.floor(x * f) / f).toString().replace(".", ",")}${unit}+`;
  };
  if (v < 10_000) return fmt(v / 1000, "k", 1);
  if (v < 1_000_000) return fmt(v / 1000, "k", 0);
  if (v < 10_000_000) return fmt(v / 1_000_000, "tr", 1);
  return fmt(v / 1_000_000, "tr", 0);
}

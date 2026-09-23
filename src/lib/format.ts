export const vnd = (n: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);

export const PLATFORMS: Record<string, { label: string; color: string }> = {
  shopee: { label: "Shopee", color: "#ee4d2d" },
  lazada: { label: "Lazada", color: "#0f146d" },
  tiktok: { label: "TikTok Shop", color: "#111111" },
};

export const shortDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";

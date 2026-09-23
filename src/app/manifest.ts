import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Săn Deal – Deal giảm thật Shopee, Lazada, TikTok Shop",
    short_name: "Săn Deal",
    description: "Deal giảm thật, mã giảm giá, lịch sử giá và báo khi giá giảm.",
    start_url: "/?utm_source=pwa",
    display: "standalone",
    background_color: "#fff7f2",
    theme_color: "#d0390f",
    lang: "vi",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Kiểm tra giá", url: "/kiem-tra-gia", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Mã giảm giá", url: "/vouchers", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Lịch sale", url: "/lich-sale", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
    share_target: { action: "/kiem-tra-gia", method: "GET", params: { url: "url", text: "text", title: "title" } },
  } as MetadataRoute.Manifest;
}

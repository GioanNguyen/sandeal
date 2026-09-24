import fs from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { PLATFORMS, vnd } from "./format";

export const OG_SIZE = { width: 1200, height: 630 };
/** Mỗi bộ ký tự là một font riêng, liệt kê theo thứ tự để chữ nào thiếu thì lấy ở font sau */
const FAMILY = "BVP-latin, BVP-latin-ext, BVP-vietnamese";

type Font = { name: string; data: ArrayBuffer; weight: 700 | 800; style: "normal" };
let fontCache: Font[] | null = null;
/** Be Vietnam Pro (OFL) gồm 3 bộ ký tự: latin, latin-ext (ă, đ, ơ, ư), vietnamese (ả, ế, ộ…) */
async function fonts(): Promise<Font[]> {
  if (fontCache) return fontCache;
  const dir = path.join(process.cwd(), "src", "assets", "fonts");
  const list: Font[] = [];
  for (const weight of [700, 800] as const) {
    for (const sub of ["latin", "latin-ext", "vietnamese"]) {
      const buf = await fs.readFile(path.join(dir, `be-vietnam-pro-${sub}-${weight}-normal.woff`));
      list.push({ name: `BVP-${sub}`, data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, weight, style: "normal" });
    }
  }
  fontCache = list;
  return list;
}

/** Tải ảnh sản phẩm thành data URL (3 giây), lỗi thì trả null để vẽ khung thay thế */
async function imageData(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    if (!/^image\/(png|jpe?g|gif|webp|svg\+xml)/.test(type)) return null;
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

const C = { bg: "#fff7f2", text: "#1c1a19", muted: "#5b6170", primary: "#d0390f", save: "#047857", saveSoft: "#dcfce7", border: "#f1e3da" };

function Brand() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 52, height: 52, borderRadius: 14, background: "linear-gradient(120deg,#e8491d,#ffa41b)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 30, fontWeight: 800 }}>S</div>
      <div style={{ display: "flex", fontSize: 30, fontWeight: 800, color: C.text }}>Săn Deal</div>
    </div>
  );
}

export interface OgProduct {
  name: string;
  platform: string;
  imageUrl: string | null;
  price: number;
  originalPrice: number | null;
  realDropPct: number;
  shopType?: string | null;
  history?: number[];
}

/** Ảnh xem trước khi chia sẻ link sản phẩm lên Facebook, Zalo, Messenger… */
export async function productOgImage(p: OgProduct) {
  const img = await imageData(p.imageUrl);
  const usual = p.realDropPct >= 1 ? p.price / (1 - p.realDropPct / 100) : p.price;
  const saving = Math.round((usual - p.price) / 1000) * 1000;
  const plat = PLATFORMS[p.platform] ?? { label: p.platform, color: "#666" };
  const name = p.name.length > 48 ? `${p.name.slice(0, 46).trim()}…` : p.name;

  // Biểu đồ tí hon từ lịch sử giá
  const h = p.history && p.history.length >= 3 ? [...p.history, p.price] : null;
  let spark = "";
  if (h) {
    const lo = Math.min(...h), hi = Math.max(...h), W = 520, H = 90;
    spark = h.map((v, i) => `${i ? "L" : "M"}${((i / (h.length - 1)) * W).toFixed(1)},${(6 + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - 12)).toFixed(1)}`).join(" ");
  }

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: C.bg, padding: 48, gap: 48, fontFamily: FAMILY }}>
        <div style={{ width: 534, height: 534, borderRadius: 32, overflow: "hidden", background: "#fff", border: `2px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} width={534} height={534} style={{ objectFit: "cover" }} alt="" />
          ) : (
            <div style={{ display: "flex", fontSize: 40, color: C.muted, fontWeight: 700 }}>{plat.label}</div>
          )}
          {p.realDropPct >= 5 && (
            <div style={{ position: "absolute", top: 24, left: 24, display: "flex", background: C.primary, color: "#fff", fontSize: 34, fontWeight: 800, padding: "8px 20px", borderRadius: 999 }}>
              -{Math.round(p.realDropPct)}% thật
            </div>
          )}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 24, fontWeight: 700, color: C.text, background: "#fff", border: `2px solid ${C.border}`, padding: "6px 16px", borderRadius: 999 }}>
                <div style={{ width: 14, height: 14, borderRadius: 999, background: plat.color }} />
                {plat.label}
              </div>
              {p.shopType === "mall" && <div style={{ display: "flex", fontSize: 22, fontWeight: 800, color: "#fff", background: "#d0011b", padding: "8px 14px", borderRadius: 8 }}>MALL</div>}
            </div>
            <div style={{ display: "flex", fontSize: 38, fontWeight: 800, color: C.text, lineHeight: 1.2 }}>{name}</div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 68, fontWeight: 800, color: C.primary, lineHeight: 1.05 }}>{vnd(p.price)}</div>
              {p.originalPrice && p.originalPrice > p.price ? (
                <div style={{ display: "flex", gap: 10, fontSize: 26, color: C.muted }}>
                  Niêm yết <span style={{ textDecoration: "line-through" }}>{vnd(p.originalPrice)}</span>
                </div>
              ) : null}
            </div>
            {saving >= 1000 ? (
              <div style={{ display: "flex", flexDirection: "column", alignSelf: "flex-start", background: C.saveSoft, color: C.save, padding: "12px 20px", borderRadius: 18 }}>
                <div style={{ display: "flex", fontSize: 20, fontWeight: 800 }}>RẺ HƠN GIÁ THƯỜNG NGÀY</div>
                <div style={{ display: "flex", fontSize: 38, fontWeight: 800 }}>{vnd(saving)}</div>
              </div>
            ) : null}
            {spark && (
              <svg width="520" height="56" viewBox="0 0 520 90" preserveAspectRatio="none">
                <path d={spark} fill="none" stroke={C.primary} strokeWidth="4" />
              </svg>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Brand />
            <div style={{ display: "flex", fontSize: 22, color: C.muted, fontWeight: 700 }}>Lịch sử giá · Deal giảm thật</div>
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: await fonts() },
  );
}

/** Ảnh chia sẻ chung (trang chủ, bộ sưu tập…) */
export async function genericOgImage(title: string, subtitle: string) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64, fontFamily: FAMILY, background: "linear-gradient(120deg,#e8491d 0%,#f26b1d 55%,#ffa41b 100%)", color: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: "rgba(255,255,255,0.22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38, fontWeight: 800 }}>S</div>
          <div style={{ display: "flex", fontSize: 38, fontWeight: 800 }}>Săn Deal</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", fontSize: 70, fontWeight: 800, lineHeight: 1.1 }}>{title}</div>
          <div style={{ display: "flex", fontSize: 32, fontWeight: 700, opacity: 0.95 }}>{subtitle}</div>
        </div>
        <div style={{ display: "flex", fontSize: 26, fontWeight: 700, opacity: 0.9 }}>Shopee · Lazada · TikTok Shop — so với giá 30 ngày, không tin giá ảo</div>
      </div>
    ),
    { ...OG_SIZE, fonts: await fonts() },
  );
}

/** Ảnh xem trước cho danh sách deal chia sẻ: tiêu đề, số món, tổng tiết kiệm, 4 ảnh sản phẩm */
export async function listOgImage(title: string, items: { imageUrl: string | null; price: number; realDropPct: number }[]) {
  const imgs = await Promise.all(items.slice(0, 4).map((x) => imageData(x.imageUrl)));
  const saving = items.reduce((s, x) => s + (x.realDropPct >= 1 ? x.price / (1 - x.realDropPct / 100) - x.price : 0), 0);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", padding: 56, gap: 44, fontFamily: FAMILY, background: C.bg, color: C.text }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
          <Brand />
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: C.primary }}>Danh sách deal chia sẻ</div>
            <div style={{ display: "flex", fontSize: 56, fontWeight: 800, lineHeight: 1.15 }}>{title.slice(0, 60)}</div>
            <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: C.muted }}>{items.length} món đang giảm thật</div>
          </div>
          {saving >= 1000 ? (
            <div style={{ display: "flex", alignSelf: "flex-start", fontSize: 30, fontWeight: 800, color: C.save, background: C.saveSoft, padding: "12px 22px", borderRadius: 16 }}>
              Rẻ hơn thường ngày tổng {vnd(Math.round(saving / 1000) * 1000)}
            </div>
          ) : <div style={{ display: "flex" }} />}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", width: 500, gap: 16, alignContent: "center" }}>
          {[0, 1, 2, 3].map((k) => (
            <div key={k} style={{ display: "flex", width: 242, height: 242, borderRadius: 24, overflow: "hidden", background: "#ffe6dc", border: `2px solid ${C.border}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {imgs[k] ? <img src={imgs[k]!} width={242} height={242} style={{ objectFit: "cover" }} alt="" /> : null}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: await fonts() },
  );
}

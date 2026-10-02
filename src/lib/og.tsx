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

let logoCache: string | null = null;
/** Logo tròn Săn Deal (đã cắt nền), dùng cho ảnh chia sẻ trang chủ */
async function logoData() {
  if (logoCache) return logoCache;
  const buf = await fs.readFile(path.join(process.cwd(), "src", "assets", "logo-sandeal.png"));
  logoCache = `data:image/png;base64,${buf.toString("base64")}`;
  return logoCache;
}

/** Ảnh xem trước khi chia sẻ link trang chủ (và các trang không có ảnh riêng) */
export async function homeOgImage(domain: string) {
  const logo = await logoData();
  const points = ["Biết ngay giảm thật hay giảm ảo", "So với lịch sử giá 30 ngày qua", "Mã giảm giá còn hạn, báo khi giá giảm"];
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 40,
          padding: "0 64px 0 44px",
          fontFamily: FAMILY,
          color: "#fff",
          backgroundColor: "#1a0b3d",
          backgroundImage:
            "radial-gradient(circle at 18% 50%, rgba(168,85,247,0.55) 0%, rgba(26,11,61,0) 45%), radial-gradient(circle at 95% 0%, rgba(236,72,153,0.45) 0%, rgba(26,11,61,0) 40%), radial-gradient(circle at 90% 100%, rgba(34,211,238,0.35) 0%, rgba(26,11,61,0) 40%)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} width={520} height={520} alt="" style={{ flex: "none" }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", alignSelf: "flex-start", fontSize: 22, fontWeight: 700, color: "#fde68a", background: "rgba(255,255,255,0.1)", border: "2px solid rgba(255,255,255,0.18)", padding: "6px 18px", borderRadius: 999 }}>
            {domain}
          </div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 62, fontWeight: 800, lineHeight: 1.08 }}>
            <span>Săn deal</span>
            <span style={{ color: "#fbbf24" }}>giảm thật</span>
          </div>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: "#e9d5ff" }}>Shopee · Lazada · TikTok Shop</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 6 }}>
            {points.map((t) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>
                <div style={{ width: 14, height: 14, flex: "none", borderRadius: 999, background: "linear-gradient(135deg,#34d399,#22d3ee)" }} />
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: await fonts() },
  );
}

/**
 * Ảnh vuông 1080×1080 để chia sẻ lên Zalo/Facebook/Instagram: ảnh sản phẩm, giá, mức giảm thật,
 * biểu đồ giá và thời điểm lấy giá (giá sàn thay đổi liên tục nên luôn ghi giờ).
 */
export async function productSquareImage(p: OgProduct & { usual: number; low: number; at: Date; domain: string }) {
  const img = await imageData(p.imageUrl);
  const plat = PLATFORMS[p.platform] ?? { label: p.platform, color: "#666" };
  const name = p.name.length > 70 ? `${p.name.slice(0, 68).trim()}…` : p.name;
  const saving = Math.round((p.usual - p.price) / 1000) * 1000;
  const h = p.history && p.history.length >= 2 ? [...p.history, p.price] : null;
  let spark = "", area = "";
  const W = 920, H = 250;
  if (h) {
    const lo = Math.min(...h), hi = Math.max(...h);
    const pts = h.map((v, i) => [(i / (h.length - 1)) * W, 10 + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - 20)] as const);
    spark = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    area = `${spark} L${W},${H} L0,${H} Z`;
  }
  const at = p.at.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" });
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.bg, padding: 64, gap: 28, fontFamily: FAMILY, color: C.text }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Brand />
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 26, fontWeight: 700, background: "#fff", border: `2px solid ${C.border}`, padding: "8px 18px", borderRadius: 999 }}>
            <div style={{ width: 16, height: 16, borderRadius: 999, background: plat.color }} />
            {plat.label}
          </div>
        </div>
        <div style={{ display: "flex", gap: 36, alignItems: "center" }}>
          <div style={{ width: 380, height: 380, borderRadius: 32, overflow: "hidden", background: "#fff", border: `2px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} width={380} height={380} style={{ objectFit: "cover" }} alt="" />
            ) : (
              <div style={{ display: "flex", fontSize: 36, color: C.muted, fontWeight: 700 }}>{plat.label}</div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
            <div style={{ display: "flex", fontSize: 36, fontWeight: 800, lineHeight: 1.2 }}>{name}</div>
            <div style={{ display: "flex", fontSize: 76, fontWeight: 800, color: C.primary, lineHeight: 1 }}>{vnd(p.price)}</div>
            {p.realDropPct >= 5 && saving >= 1000 ? (
              <div style={{ display: "flex", flexDirection: "column", alignSelf: "flex-start", background: C.saveSoft, color: C.save, padding: "12px 20px", borderRadius: 18 }}>
                <div style={{ display: "flex", fontSize: 22, fontWeight: 800 }}>GIẢM THẬT {Math.round(p.realDropPct)}%</div>
                <div style={{ display: "flex", fontSize: 30, fontWeight: 800 }}>rẻ hơn thường ngày {vnd(saving)}</div>
              </div>
            ) : (
              <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: C.muted }}>Giá thường ngày {vnd(p.usual)}</div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, background: "#fff", border: `2px solid ${C.border}`, borderRadius: 24, padding: "20px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, fontWeight: 700, color: C.muted }}>
            <span>Lịch sử giá</span>
            <span style={{ color: C.save }}>Thấp nhất {vnd(p.low)}</span>
          </div>
          {spark ? (
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
              <path d={area} fill="rgba(208,57,15,0.10)" />
              <path d={spark} fill="none" stroke={C.primary} strokeWidth="5" strokeLinejoin="round" />
            </svg>
          ) : (
            <div style={{ display: "flex", fontSize: 26, color: C.muted, height: H, alignItems: "center" }}>Mới bắt đầu theo dõi giá</div>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: C.muted, fontWeight: 700, marginTop: "auto" }}>
          <span>Giá lúc {at} · có thể thay đổi</span>
          <span style={{ color: C.primary }}>{p.domain}</span>
        </div>
      </div>
    ),
    { width: 1080, height: 1080, fonts: await fonts() },
  );
}

export const STORY_SIZE = { width: 1080, height: 1920 };

export interface StoryItem {
  name: string;
  platform: string;
  imageUrl: string | null;
  price: number;
  originalPrice: number | null;
  realDropPct: number;
}

/**
 * Ảnh Story dọc 9:16 cho Trang Facebook. Story đăng qua API không gắn được link bấm,
 * nên ảnh ghi rõ "link ở bài viết mới nhất" và link ngắn để gõ tay.
 * Chừa khoảng trên/dưới (~230px) cho thanh tên Trang và ô trả lời của Facebook.
 */
export async function storyImage(o: { headline: string; items: StoryItem[]; hidePrice?: boolean; link: string }) {
  const items = o.items.slice(0, 4);
  const imgs = await Promise.all(items.map((x) => imageData(x.imageUrl)));
  const one = items.length === 1 ? items[0] : null;
  const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);
  const pct = (x: StoryItem) => (x.realDropPct >= 5 ? `-${Math.round(x.realDropPct)}% thật` : "");

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", fontFamily: FAMILY, background: "linear-gradient(170deg,#e8491d 0%,#f26b1d 45%,#ffa41b 100%)", padding: "220px 64px 230px", gap: 36 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 42, fontWeight: 800 }}>S</div>
          <div style={{ display: "flex", fontSize: 42, fontWeight: 800, color: "#fff" }}>Săn Deal</div>
        </div>
        <div style={{ display: "flex", fontSize: 76, fontWeight: 800, color: "#fff", lineHeight: 1.08 }}>{o.headline}</div>

        {one ? (
          <div style={{ display: "flex", flexDirection: "column", background: "#fff", borderRadius: 48, padding: 36, gap: 16 }}>
            <div style={{ display: "flex", width: 880, height: 520, borderRadius: 32, overflow: "hidden", background: "#fff", alignItems: "center", justifyContent: "center", position: "relative" }}>
              {imgs[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imgs[0]} width={520} height={520} style={{ objectFit: "contain" }} alt="" />
              ) : (
                <div style={{ display: "flex", fontSize: 48, color: C.muted, fontWeight: 700 }}>{PLATFORMS[one.platform]?.label ?? one.platform}</div>
              )}
              {pct(one) && !o.hidePrice && (
                <div style={{ position: "absolute", top: 12, left: 12, display: "flex", background: C.primary, color: "#fff", fontSize: 46, fontWeight: 800, padding: "10px 26px", borderRadius: 999 }}>{pct(one)}</div>
              )}
            </div>
            <div style={{ display: "flex", fontSize: 42, fontWeight: 800, color: C.text, lineHeight: 1.2 }}>{cut(one.name, 64)}</div>
            {o.hidePrice ? (
              <div style={{ display: "flex", fontSize: 96, fontWeight: 800, color: C.primary }}>Giá bao nhiêu?</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", fontSize: 100, fontWeight: 800, color: C.primary, lineHeight: 1 }}>{vnd(one.price)}</div>
                {one.originalPrice && one.originalPrice > one.price ? (
                  <div style={{ display: "flex", gap: 12, fontSize: 36, color: C.muted }}>
                    Niêm yết <span style={{ textDecoration: "line-through" }}>{vnd(one.originalPrice)}</span>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {items.map((x, k) => (
              <div key={k} style={{ display: "flex", background: "#fff", borderRadius: 32, padding: 18, gap: 24, alignItems: "center" }}>
                <div style={{ display: "flex", width: 170, height: 170, borderRadius: 22, overflow: "hidden", background: "#fff", alignItems: "center", justifyContent: "center", border: `2px solid ${C.border}` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {imgs[k] ? <img src={imgs[k]!} width={166} height={166} style={{ objectFit: "contain" }} alt="" /> : null}
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", fontSize: 32, fontWeight: 800, color: C.text, lineHeight: 1.2 }}>{`${k + 1}. ${cut(x.name, 50)}`}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ display: "flex", fontSize: 50, fontWeight: 800, color: C.primary }}>{vnd(x.price)}</div>
                    {pct(x) && <div style={{ display: "flex", fontSize: 30, fontWeight: 800, color: C.save, background: C.saveSoft, padding: "6px 14px", borderRadius: 999 }}>{pct(x)}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", flex: 1 }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", background: "#fff", color: C.primary, fontSize: 44, fontWeight: 800, padding: "22px 44px", borderRadius: 999 }}>{o.hidePrice ? "Đáp án ở bài viết mới nhất của Trang" : "Link mua ở bài viết mới nhất của Trang"}</div>
          <div style={{ display: "flex", color: "#fff", fontSize: 40, fontWeight: 800 }}>{o.link}</div>
        </div>
      </div>
    ),
    { ...STORY_SIZE, fonts: await fonts() },
  );
}

// ===================== Reels (video dọc 1080×1920) =====================

/** Vùng biểu đồ trong cảnh 2 (toạ độ trên khung hình): ffmpeg phủ một tấm trắng lên đúng vùng này rồi kéo sang phải để "vẽ dần" biểu đồ */
export const REEL_PLOT = { x: 112, y: 700, w: 856, h: 520 };

export interface ReelFrameData {
  hook: string;
  sub?: string;
  name: string;
  platform: string;
  imageUrl: string | null;
  price: number;
  originalPrice: number | null;
  realDropPct: number;
  chart: { points: [number, number][]; low: number; usual: number; high: number; days: number };
  verdict: { tone: "good" | "wait" | "new"; title: string };
  reasons: string[];
  afterCode: number | null;
  link: string;
}

const GRAD = "linear-gradient(170deg,#e8491d 0%,#f26b1d 45%,#ffa41b 100%)";

function ReelBrand({ light }: { light: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <div style={{ width: 72, height: 72, borderRadius: 20, background: light ? "rgba(255,255,255,0.25)" : C.primary, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 42, fontWeight: 800 }}>S</div>
      <div style={{ display: "flex", fontSize: 42, fontWeight: 800, color: light ? "#fff" : C.text }}>Săn Deal</div>
    </div>
  );
}

/** Biểu đồ bậc thang (giá đổi theo thời điểm) vẽ bằng SVG, đúng kích thước REEL_PLOT */
function reelChart(c: ReelFrameData["chart"], current: number) {
  const { w: W, h: H } = REEL_PLOT;
  const pts = c.points.length >= 2 ? c.points : [[Date.now() - 86_400_000, current], [Date.now(), current]] as [number, number][];
  const t0 = pts[0][0], t1 = pts[pts.length - 1][0];
  const ys = [...pts.map((p) => p[1]), c.usual, c.low];
  const lo = Math.min(...ys) * 0.97, hi = Math.max(...ys) * 1.03;
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * (W - 24) + 12;
  const y = (v: number) => 16 + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - 32);
  let d = `M${x(t0).toFixed(1)},${y(pts[0][1]).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) d += ` H${x(pts[i][0]).toFixed(1)} V${y(pts[i][1]).toFixed(1)}`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <line x1={0} x2={W} y1={y(c.usual)} y2={y(c.usual)} stroke="#9aa0ab" strokeWidth={3} strokeDasharray="14 12" />
      <line x1={0} x2={W} y1={y(c.low)} y2={y(c.low)} stroke={C.save} strokeWidth={3} strokeDasharray="14 12" />
      <path d={d} fill="none" stroke={C.primary} strokeWidth={8} strokeLinejoin="round" />
      <circle cx={x(t1)} cy={y(current)} r={16} fill={C.primary} stroke="#fff" strokeWidth={6} />
    </svg>
  );
}

/** Một cảnh của Reel: 1 = câu mở đầu + ảnh sản phẩm, 2 = lịch sử giá, 3 = kết luận + giá + lời kêu gọi */
export async function reelFrame(scene: 1 | 2 | 3, o: ReelFrameData) {
  const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);
  const img = scene === 1 ? await imageData(o.imageUrl) : null;
  const plat = PLATFORMS[o.platform]?.label ?? o.platform;
  let body: React.ReactElement;
  if (scene === 1) {
    body = (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", fontFamily: FAMILY, background: GRAD, padding: "200px 64px 240px", gap: 30 }}>
        <ReelBrand light />
        <div style={{ display: "flex", fontSize: 96, fontWeight: 800, color: "#fff", lineHeight: 1.05 }}>{o.hook}</div>
        {o.sub ? <div style={{ display: "flex", fontSize: 54, fontWeight: 800, color: "rgba(255,255,255,0.92)", lineHeight: 1.15 }}>{o.sub}</div> : null}
        <div style={{ display: "flex", flexDirection: "column", background: "#fff", borderRadius: 48, padding: 32, gap: 18, marginTop: 10 }}>
          <div style={{ display: "flex", width: 888, height: 700, alignItems: "center", justifyContent: "center", borderRadius: 32, overflow: "hidden", background: "#fff" }}>
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} width={700} height={700} style={{ objectFit: "contain" }} alt="" />
            ) : (
              <div style={{ display: "flex", fontSize: 64, color: C.muted, fontWeight: 800 }}>{plat}</div>
            )}
          </div>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 800, color: C.text, lineHeight: 1.2 }}>{cut(o.name, 70)}</div>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: C.muted }}>{`Trên ${plat}`}</div>
        </div>
      </div>
    );
  } else if (scene === 2) {
    const stat = (label: string, v: number, color: string) => (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#fff", borderRadius: 28, padding: "22px 24px", gap: 6, border: `3px solid ${C.border}` }}>
        <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: C.muted }}>{label}</div>
        <div style={{ display: "flex", fontSize: 50, fontWeight: 800, color }}>{vnd(v)}</div>
      </div>
    );
    body = (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", fontFamily: FAMILY, background: C.bg, padding: "200px 64px 240px", gap: 22, position: "relative" }}>
        <ReelBrand light={false} />
        <div style={{ display: "flex", fontSize: 76, fontWeight: 800, color: C.text, lineHeight: 1.08 }}>{`Giá ${o.chart.days} ngày qua`}</div>
        <div style={{ display: "flex", fontSize: 38, fontWeight: 700, color: C.muted }}>{cut(o.name, 46)}</div>
        <div style={{ position: "absolute", left: 64, top: REEL_PLOT.y - 48, width: 952, height: REEL_PLOT.h + 96, display: "flex", background: "#fff", borderRadius: 40, border: `3px solid ${C.border}` }} />
        <div style={{ position: "absolute", left: REEL_PLOT.x, top: REEL_PLOT.y, width: REEL_PLOT.w, height: REEL_PLOT.h, display: "flex" }}>{reelChart(o.chart, o.price)}</div>
        <div style={{ position: "absolute", left: 64, top: REEL_PLOT.y + REEL_PLOT.h + 84, width: 952, display: "flex", gap: 18 }}>
          {stat("Thấp nhất", o.chart.low, C.save)}
          {stat("Thường ngày", o.chart.usual, C.text)}
          {stat("Hôm nay", o.price, C.primary)}
        </div>
      </div>
    );
  } else {
    const tone = o.verdict.tone === "good" ? { bg: C.saveSoft, fg: C.save } : o.verdict.tone === "wait" ? { bg: "#fef3c7", fg: "#b45309" } : { bg: "#eef2ff", fg: "#3730a3" };
    body = (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", fontFamily: FAMILY, background: GRAD, padding: "200px 64px 240px", gap: 28 }}>
        <ReelBrand light />
        <div style={{ display: "flex", flexDirection: "column", background: "#fff", borderRadius: 48, padding: 44, gap: 22 }}>
          <div style={{ display: "flex", alignSelf: "flex-start", background: tone.bg, color: tone.fg, fontSize: 46, fontWeight: 800, padding: "14px 30px", borderRadius: 999 }}>{o.verdict.title}</div>
          <div style={{ display: "flex", fontSize: 150, fontWeight: 800, color: C.primary, lineHeight: 1 }}>{vnd(o.price)}</div>
          {o.originalPrice && o.originalPrice > o.price ? (
            <div style={{ display: "flex", gap: 14, fontSize: 40, color: C.muted }}>
              Niêm yết <span style={{ textDecoration: "line-through" }}>{vnd(o.originalPrice)}</span>
            </div>
          ) : null}
          {o.realDropPct >= 5 ? (
            <div style={{ display: "flex", alignSelf: "flex-start", fontSize: 44, fontWeight: 800, color: C.save, background: C.saveSoft, padding: "10px 24px", borderRadius: 999 }}>{`Rẻ hơn giá thường ngày ${Math.round(o.realDropPct)}%`}</div>
          ) : null}
          {o.afterCode ? <div style={{ display: "flex", fontSize: 42, fontWeight: 800, color: C.text }}>{`Áp mã còn ${vnd(o.afterCode)}`}</div> : null}
          {o.reasons.slice(0, 2).map((r, k) => (
            <div key={k} style={{ display: "flex", gap: 14, fontSize: 36, color: C.text, lineHeight: 1.3 }}>
              <div style={{ display: "flex", color: C.primary, fontWeight: 800 }}>•</div>
              <div style={{ display: "flex", flex: 1 }}>{cut(r, 90)}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flex: 1 }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", background: "#fff", color: C.primary, fontSize: 50, fontWeight: 800, padding: "24px 48px", borderRadius: 999 }}>Link mua ở bình luận</div>
          <div style={{ display: "flex", color: "#fff", fontSize: 42, fontWeight: 800 }}>{o.link}</div>
        </div>
      </div>
    );
  }
  return new ImageResponse(body, { ...STORY_SIZE, fonts: await fonts() });
}

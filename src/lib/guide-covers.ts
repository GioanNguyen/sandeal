/**
 * Nội dung ảnh bìa của từng bài hướng dẫn (đăng Facebook, ảnh xem trước khi chia sẻ link).
 * kicker: chủ đề ngắn · scene: cảnh minh hoạ vẽ từ đúng thứ người mua thấy trên app sàn (tem giá, phiếu mã, biểu đồ giá…),
 * số liệu trong cảnh lấy theo ví dụ trong bài · points: 3 ý chính ngắn (≤ 42 ký tự) in trên ảnh dọc.
 * Thêm bài mới vào lịch thì thêm 1 mục ở đây; thiếu thì ảnh dùng cảnh biểu đồ giá mặc định.
 */
export type CoverScene =
  | { type: "fakeTag"; was: string; now: string; pct: string }
  | { type: "vouchers"; items: { big: string; small: string; tone: "red" | "green" | "gold" }[] }
  | { type: "calendar"; days: string[]; hot: string; note: string }
  | { type: "chart"; points: number[]; marks?: { at: number; label: string }[]; badge: string }
  | { type: "compare"; rows: { name: string; color: string; price: string; tag?: string }[] }
  | { type: "shop"; name: string; rating: string; reviews: string; stars: number[] }
  | { type: "reviews"; items: { stars: number; text: string; flag?: string }[] }
  | { type: "unit"; items: { name: string; price: string; unit: string; best?: boolean }[] }
  | { type: "flash"; price: string; was: string; time: string; sold: number }
  | { type: "gift"; items: { text: string; done: boolean }[] };

export interface GuideCover {
  kicker: string;
  scene: CoverScene;
  points: string[];
}

const PF = { shopee: "#ee4d2d", lazada: "#0f146d", tiktok: "#111111" };

export const GUIDE_COVERS: Record<string, GuideCover> = {
  "cach-nhan-biet-giam-gia-ao": {
    kicker: "Mẹo mua sắm",
    scene: { type: "fakeTag", was: "900.000 ₫", now: "349.000 ₫", pct: "−61%" },
    points: ["So với giá 30 ngày, không so giá gạch", "Cảnh giác món tăng giá trước sale", "Tính giá cuối sau mã và phí ship"],
  },
  "cach-dung-ma-giam-gia-shopee-lazada-tiktok": {
    kicker: "Mã giảm giá",
    scene: {
      type: "vouchers",
      items: [
        { big: "Giảm 10%", small: "Tối đa 50K · Đơn từ 200K", tone: "red" },
        { big: "Freeship", small: "Đơn từ 0₫ · Toàn sàn", tone: "green" },
        { big: "Giảm 30K", small: "Mã của shop · Đơn từ 150K", tone: "gold" },
      ],
    },
    points: ["Phân biệt mã shop, mã sàn, freeship", "Đọc đúng mức giảm tối đa", "Đừng mua thêm chỉ để đủ đơn"],
  },
  "khi-nao-nen-mua-hang-online": {
    kicker: "Thời điểm mua",
    scene: { type: "calendar", days: ["10.10", "15.10", "25.10", "11.11"], hot: "11.11", note: "Ngày đôi · giữa tháng · ngày lương" },
    points: ["Các mốc sale định kỳ trong tháng", "Khi nào nên mua ngay", "Khi nào nên chờ đợt sale tới"],
  },
  "kinh-nghiem-san-sale-ngay-doi": {
    kicker: "Săn sale ngày đôi",
    scene: { type: "calendar", days: ["9.9", "10.10", "11.11", "12.12"], hot: "10.10", note: "Lưu mã từ 0h · lên danh sách trước 2 tuần" },
    points: ["Lên danh sách trước 2 tuần", "Xem món nào đang bị đẩy giá", "Canh giờ mở mã, không canh giờ mua"],
  },
  "cach-xem-lich-su-gia-san-pham": {
    kicker: "Lịch sử giá",
    scene: { type: "chart", points: [520, 520, 495, 540, 540, 470, 510, 510, 455, 455, 430], badge: "Thấp nhất 90 ngày" },
    points: ["Dán link để xem giá 90 ngày", "Xem ngay trên trang sàn bằng tiện ích", "Đọc biểu đồ giá cho đúng"],
  },
  "shopee-lazada-tiktok-shop-san-nao-re-hon": {
    kicker: "So sánh sàn",
    scene: {
      type: "compare",
      rows: [
        { name: "TikTok Shop", color: PF.tiktok, price: "121.000 ₫", tag: "Rẻ nhất" },
        { name: "Shopee", color: PF.shopee, price: "192.000 ₫" },
        { name: "Lazada", color: PF.lazada, price: "244.000 ₫" },
      ],
    },
    points: ["So cùng sản phẩm, không so cùng tên", "Tính đủ mã giảm và phí ship", "Xem thêm shop, giao hàng, đổi trả"],
  },
  "cach-kiem-tra-shop-uy-tin": {
    kicker: "Chọn shop",
    scene: { type: "shop", name: "Shop Gia Dụng Xinh", rating: "4,8", reviews: "3.214 đánh giá", stars: [82, 10, 3, 2, 3] },
    points: ["Điểm shop đi cùng số lượt đánh giá", "Để ý tỉ lệ đánh giá 1–2 sao", "Rẻ bất thường so với hàng chính hãng"],
  },
  "cach-doc-danh-gia-san-pham": {
    kicker: "Đánh giá sản phẩm",
    scene: {
      type: "reviews",
      items: [
        { stars: 5, text: "Shop nhiệt tình, giao nhanh!!!", flag: "Khen chung chung" },
        { stars: 4, text: "Dùng 1 tháng pin vẫn tốt, hơi nặng", flag: undefined },
        { stars: 2, text: "Size L nhưng form nhỏ, nên lấy lên 1 size", flag: undefined },
      ],
    },
    points: ["Dấu hiệu đánh giá được “bơm”", "Đọc theo từng khía cạnh", "Ưu tiên đánh giá có ảnh, có phân loại"],
  },
  "mua-size-lon-combo-co-re-hon": {
    kicker: "Giá theo đơn vị",
    scene: {
      type: "unit",
      items: [
        { name: "Nước giặt 3,8 kg", price: "190.000 ₫", unit: "50.000 ₫/kg" },
        { name: "Túi 2 kg", price: "89.000 ₫", unit: "44.500 ₫/kg", best: true },
      ],
    },
    points: ["Chia giá cho ml, gam hay số viên", "Khi nào combo đắt hơn mua lẻ", "Chọn đúng phân loại trước khi so"],
  },
  "flash-sale-co-that-re-khong": {
    kicker: "Flash sale",
    scene: { type: "flash", price: "299.000 ₫", was: "599.000 ₫", time: "01:59:42", sold: 86 },
    points: ["So với giá thường ngày của món", "Xem món đã từng rẻ hơn chưa", "Kiểm tra giá chỉ mất 10 giây"],
  },
  "shop-mall-va-shop-thuong": {
    kicker: "Mall hay shop thường",
    scene: {
      type: "compare",
      rows: [
        { name: "Shop Mall", color: "#d0021b", price: "349.000 ₫", tag: "Chính hãng" },
        { name: "Shop A", color: "#5b6170", price: "315.000 ₫" },
        { name: "Shop B", color: "#5b6170", price: "179.000 ₫", tag: "Rẻ bất thường" },
      ],
    },
    points: ["Món nên ưu tiên shop chính hãng", "Món mua shop thường vẫn ổn", "Mức chênh giá bao nhiêu là bất thường"],
  },
  "black-friday-co-re-hon-11-11": {
    kicker: "Black Friday",
    scene: {
      type: "chart",
      points: [610, 610, 640, 520, 600, 600, 610, 560, 590, 590, 575],
      marks: [{ at: 3, label: "11.11" }, { at: 7, label: "BF" }],
      badge: "Hôm nay ≈ giá 11.11?",
    },
    points: ["So bằng giá của chính món ở 11.11", "Xem ước tính giá đợt sale tới", "Lúc nào nên mua ngay"],
  },
  "mua-qua-cuoi-nam-online": {
    kicker: "Quà cuối năm",
    scene: {
      type: "gift",
      items: [
        { text: "Nồi chiên cho bố mẹ · 12.12", done: true },
        { text: "Áo khoác cho em · đầu tháng 1", done: true },
        { text: "Bánh kẹo Tết · sát Tết", done: false },
        { text: "Hoa, đồ trang trí", done: false },
      ],
    },
    points: ["Chia danh sách theo thời điểm mua", "Theo dõi giá từ tháng 12", "Đặt sớm để kịp giao trước Tết"],
  },
};

const DEFAULT_COVER: GuideCover = {
  kicker: "Hướng dẫn săn deal",
  scene: { type: "chart", points: [520, 540, 500, 530, 480, 470, 450], badge: "Giảm thật" },
  points: [],
};

/** Ảnh bìa của bài: bài AI soạn mang ảnh bìa riêng (g.cover), bài viết sẵn lấy trong GUIDE_COVERS */
export function coverFor(g: { slug: string; cover?: GuideCover }): GuideCover {
  return g.cover ?? GUIDE_COVERS[g.slug] ?? DEFAULT_COVER;
}

// ---------- Kiểm tra ảnh bìa do AI đề xuất ----------

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[<>{}]/g, "").replace(/\s+/g, " ").trim() : "").slice(0, max);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
const arr = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : []);
const COLORS = new Set(["#ee4d2d", "#0f146d", "#111111", "#d0021b", "#5b6170"]);

/** Làm sạch cảnh minh hoạ AI đề xuất; sai định dạng thì trả null (dùng cảnh mặc định) */
export function cleanScene(raw: unknown): CoverScene | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const ok = <T extends CoverScene>(x: T, valid: boolean) => (valid ? x : null);
  switch (r.type) {
    case "fakeTag": {
      const x = { type: "fakeTag" as const, was: str(r.was, 14), now: str(r.now, 14), pct: str(r.pct, 6) };
      return ok(x, !!(x.was && x.now && x.pct));
    }
    case "vouchers": {
      const items = arr(r.items, 3).map((v) => {
        const o = v as Record<string, unknown>;
        return { big: str(o.big, 12), small: str(o.small, 34), tone: (["red", "green", "gold"].includes(o.tone as string) ? o.tone : "red") as "red" | "green" | "gold" };
      }).filter((v) => v.big && v.small);
      return ok({ type: "vouchers", items }, items.length >= 2);
    }
    case "calendar": {
      const days = arr(r.days, 4).map((d) => str(d, 6)).filter(Boolean);
      const hot = str(r.hot, 6);
      return ok({ type: "calendar", days, hot, note: str(r.note, 46) }, days.length === 4 && days.includes(hot));
    }
    case "chart": {
      const points = arr(r.points, 14).map(num).filter((n) => n > 0);
      const marks = arr(r.marks, 3).map((m) => ({ at: Math.round(num((m as Record<string, unknown>).at)), label: str((m as Record<string, unknown>).label, 6) })).filter((m) => m.at >= 0 && m.at < points.length && m.label);
      return ok({ type: "chart", points, marks, badge: str(r.badge, 24) }, points.length >= 5 && !!str(r.badge, 24));
    }
    case "compare": {
      const rows = arr(r.rows, 3).map((v) => {
        const o = v as Record<string, unknown>;
        const color = String(o.color ?? "");
        return { name: str(o.name, 14), color: COLORS.has(color) ? color : "#5b6170", price: str(o.price, 12), ...(str(o.tag, 14) ? { tag: str(o.tag, 14) } : {}) };
      }).filter((v) => v.name && v.price);
      return ok({ type: "compare", rows }, rows.length >= 2);
    }
    case "shop": {
      const stars = arr(r.stars, 5).map(num).filter((n) => n >= 0);
      return ok({ type: "shop", name: str(r.name, 22), rating: str(r.rating, 4), reviews: str(r.reviews, 18), stars }, stars.length === 5 && !!str(r.name, 22) && stars.some((n) => n > 0));
    }
    case "reviews": {
      const items = arr(r.items, 3).map((v) => {
        const o = v as Record<string, unknown>;
        const stars = Math.min(5, Math.max(1, Math.round(num(o.stars)) || 5));
        return { stars, text: str(o.text, 44), ...(str(o.flag, 18) ? { flag: str(o.flag, 18) } : {}) };
      }).filter((v) => v.text);
      return ok({ type: "reviews", items }, items.length >= 2);
    }
    case "unit": {
      const items = arr(r.items, 2).map((v) => {
        const o = v as Record<string, unknown>;
        return { name: str(o.name, 18), price: str(o.price, 12), unit: str(o.unit, 14), ...(o.best === true ? { best: true } : {}) };
      }).filter((v) => v.name && v.price && v.unit);
      return ok({ type: "unit", items }, items.length === 2);
    }
    case "flash": {
      const time = /^\d{2}:\d{2}:\d{2}$/.test(String(r.time)) ? String(r.time) : "01:59:42";
      const sold = Math.min(98, Math.max(10, Math.round(num(r.sold)) || 80));
      return ok({ type: "flash", price: str(r.price, 12), was: str(r.was, 12), time, sold }, !!(str(r.price, 12) && str(r.was, 12)));
    }
    case "gift": {
      const items = arr(r.items, 4).map((v) => ({ text: str((v as Record<string, unknown>).text, 34), done: (v as Record<string, unknown>).done === true })).filter((v) => v.text);
      return ok({ type: "gift", items }, items.length >= 3);
    }
  }
  return null;
}

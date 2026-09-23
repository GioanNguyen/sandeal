import { Icon } from "./Icon";

/** Nhãn loại shop: Mall (chính hãng) / Yêu thích */
export function ShopBadge({ type }: { type: string | null | undefined }) {
  if (type === "mall") return <span className="shop-badge mall" title="Shop chính hãng (Mall)">Mall</span>;
  if (type === "preferred") return <span className="shop-badge pref" title="Shop yêu thích">Yêu thích</span>;
  return null;
}

/** "Cập nhật 15 phút trước"; quá 24 giờ thì nhắc giá có thể đã đổi */
export function freshness(d: Date | null | undefined, now = Date.now()) {
  if (!d) return { text: "Chưa rõ thời điểm cập nhật", stale: true };
  const m = Math.max(0, Math.round((now - d.getTime()) / 60000));
  const rel = m < 1 ? "vừa xong" : m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`;
  return { text: `Cập nhật ${rel}`, stale: m >= 1440 };
}

export function Freshness({ at, long = false, compact = false }: { at: Date | null | undefined; long?: boolean; compact?: boolean }) {
  const f = freshness(at);
  const text = compact ? f.text.replace("Cập nhật ", "").replace(" trước", "") : f.text;
  return (
    <span
      className={`freshness${f.stale ? " stale" : ""}${compact ? " compact" : ""}`}
      title={at ? `Giá cập nhật từ sàn lúc ${at.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}` : undefined}
    >
      <Icon name={f.stale ? "alert" : "refresh"} size={12} /> {text}
      {compact && <span className="sr-only"> (thời điểm cập nhật giá)</span>}
      {long && f.stale && ", giá có thể đã đổi"}
    </span>
  );
}

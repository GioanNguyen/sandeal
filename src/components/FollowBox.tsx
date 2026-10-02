import { followLinks, type FollowKind } from "@/lib/follow";
import { Icon } from "./Icon";

const ICON: Record<FollowKind, "bell" | "users" | "send"> = { page: "bell", group: "users", zalo: "send", telegram: "send" };

/**
 * Mời theo dõi Săn Deal ngoài web (Trang Facebook, nhóm, Zalo, Telegram). Không có kênh nào cấu hình thì không hiện gì.
 * - "box": khung riêng (trang sản phẩm, bài hướng dẫn, trang giảm giá ảo)
 * - "footer": hàng nút nhỏ ở chân trang
 */
export function FollowBox({ variant = "box", title, text }: { variant?: "box" | "footer"; title?: string; text?: string }) {
  const links = followLinks();
  if (!links.length) return null;
  const buttons = links.map((l, i) => (
    <a
      key={l.kind}
      href={l.url}
      target="_blank"
      rel="noopener"
      data-follow={l.kind}
      className={variant === "footer" ? "foot-follow-link" : `btn btn-sm ${i === 0 ? "btn-primary" : "btn-ghost"}`}
    >
      <Icon name={ICON[l.kind]} size={16} /> {l.label}
    </a>
  ));
  if (variant === "footer") {
    return (
      <div className="foot-follow">
        <p className="foot-platforms-label">Theo dõi Săn Deal</p>
        <p className="foot-follow-links">{buttons}</p>
      </div>
    );
  }
  return (
    <aside className="follow-box" aria-label="Theo dõi Săn Deal">
      <div className="follow-text">
        <b>{title ?? "Không muốn mua phải giá “giảm” ảo?"}</b>
        <span>{text ?? "Theo dõi Săn Deal: mỗi tuần bóc các món giảm giá ảo, báo ngay khi có deal giảm thật."}</span>
      </div>
      <div className="follow-actions">{buttons}</div>
    </aside>
  );
}

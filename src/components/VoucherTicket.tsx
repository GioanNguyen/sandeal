import type { Voucher } from "@prisma/client";
import { PLATFORMS, shortDate, vnd } from "@/lib/format";
import { CopyCode } from "./CopyCode";
import { Icon } from "./Icon";

export function VoucherTicket({ v, now = new Date() }: { v: Voucher; now?: Date }) {
  const hoursLeft = v.endAt ? (v.endAt.getTime() - now.getTime()) / 3_600_000 : Infinity;
  const platform = PLATFORMS[v.platform] ?? { label: v.platform, color: "#666" };
  const urgent = hoursLeft < 24;
  return (
    <article className="ticket">
      <div className="ticket-side" style={{ background: platform.color }}>
        <b>{v.discountText ?? "Ưu đãi"}</b>
        <span>{platform.label}</span>
      </div>
      <div className="ticket-body">
        <div className="ticket-title">{v.title}</div>
        <div className="ticket-meta">
          {v.minSpend ? `Đơn từ ${vnd(v.minSpend)}` : "Không yêu cầu đơn tối thiểu"}
        </div>
        <div className={`ticket-meta${urgent ? " urgent" : ""}`}>
          <Icon name="clock" size={14} />
          {v.endAt
            ? urgent
              ? `Còn ${Math.max(1, Math.round(hoursLeft))} giờ`
              : `HSD ${shortDate(v.endAt)}`
            : "Không rõ hạn"}
        </div>
        <div className="ticket-actions">
          {v.code ? <CopyCode code={v.code} /> : null}
          <a className="btn btn-primary" href={v.affiliateUrl} target="_blank" rel="nofollow sponsored noopener">
            Dùng ngay <Icon name="external" size={14} />
          </a>
        </div>
      </div>
    </article>
  );
}

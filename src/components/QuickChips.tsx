import Link from "next/link";
import { Icon, type IconName } from "./Icon";

export interface QuickChip {
  key: string;
  label: string;
  icon: IconName;
  on: boolean;
  href: string;
  count: number;
}

/** Chip lọc một chạm phía trên lưới deal: bấm là lọc ngay, bấm lại để bỏ */
export function QuickChips({ chips }: { chips: QuickChip[] }) {
  return (
    <nav className="quick-chips" aria-label="Lọc nhanh">
      {chips.map((c) => (
        <Link
          key={c.key}
          href={c.href}
          scroll={false}
          className={`qchip${c.on ? " on" : ""}${!c.on && c.count === 0 ? " empty" : ""}`}
          aria-pressed={c.on}
          aria-disabled={!c.on && c.count === 0 ? true : undefined}
          tabIndex={!c.on && c.count === 0 ? -1 : undefined}
        >
          <Icon name={c.icon} size={14} />
          {c.label}
          {c.on ? <span className="qchip-x" aria-label="bỏ lọc">×</span> : <span className="qchip-n">{c.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

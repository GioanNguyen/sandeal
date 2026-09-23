"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";

type Summary = { up: number; down: number; mine: -1 | 0 | 1 };

export function VoteBox({ productId, initial, loggedIn }: { productId: number; initial: Summary; loggedIn: boolean }) {
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const path = usePathname();

  async function vote(value: 1 | -1) {
    if (!loggedIn) {
      window.location.href = `/login?next=${encodeURIComponent(path)}`;
      return;
    }
    if (busy) return;
    setBusy(true);
    // cập nhật ngay trên giao diện, hoàn tác nếu lỗi
    const prev = s;
    const same = s.mine === value;
    setS({
      up: s.up - (s.mine === 1 ? 1 : 0) + (!same && value === 1 ? 1 : 0),
      down: s.down - (s.mine === -1 ? 1 : 0) + (!same && value === -1 ? 1 : 0),
      mine: same ? 0 : value,
    });
    const res = await fetch("/api/vote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, value }) }).catch(() => null);
    if (res?.ok) setS(await res.json());
    else setS(prev);
    setBusy(false);
  }

  const net = s.up - s.down;
  return (
    <div className="votebox" role="group" aria-label="Bình chọn deal">
      <button type="button" className={`vote up${s.mine === 1 ? " on" : ""}`} aria-pressed={s.mine === 1} onClick={() => vote(1)} title="Deal hot">
        <Icon name="thumbUp" size={16} /> <span>{s.up}</span><span className="sr-only"> người thấy hot</span>
      </button>
      <span className={`vote-net${net > 0 ? " pos" : net < 0 ? " neg" : ""}`} aria-label={`Điểm cộng đồng ${net}`}>{net > 0 ? `+${net}` : net}</span>
      <button type="button" className={`vote down${s.mine === -1 ? " on" : ""}`} aria-pressed={s.mine === -1} onClick={() => vote(-1)} title="Không đáng mua">
        <Icon name="thumbDown" size={16} /> <span>{s.down}</span><span className="sr-only"> người thấy không đáng</span>
      </button>
    </div>
  );
}

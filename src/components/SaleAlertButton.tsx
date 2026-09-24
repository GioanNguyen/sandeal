"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "./Icon";

/**
 * "Nhắc tôi khi Siêu sale 10.10 bắt đầu": đúng giờ sale sẽ nhận email (và thông báo trình duyệt nếu đã bật)
 * kèm giá mới của chính món này. Chưa đăng nhập thì chuyển sang đăng nhập rồi tự bật.
 */
export function SaleAlertButton({ productId, saleName, days, initialOn, loggedIn, loginHref, pushHint }: {
  productId: number;
  saleName: string;
  days: number;
  initialOn: boolean;
  loggedIn: boolean;
  loginHref: string;
  pushHint: boolean;
}) {
  const [on, setOn] = useState(initialOn);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const when = days <= 1 ? "bắt đầu lúc 0h đêm nay" : `còn ${days} ngày`;

  const toggle = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/sale-alert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, on: !on }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Không lưu được");
      setOn(d.on);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`sale-alert${on ? " is-on" : ""}`}>
      <span className="sale-alert-icon" aria-hidden="true"><Icon name={on ? "check" : "calendar"} size={20} /></span>
      <div className="sale-alert-text">
        <b>{on ? `Đã hẹn nhắc khi ${saleName} bắt đầu` : `Chờ ${saleName}?`}</b>
        <small>
          {on
            ? <>Đúng giờ sale ({when}) bạn sẽ nhận email{pushHint ? " và thông báo" : ""} kèm giá mới của món này.{!pushHint && <> <Link href="/account/so-thich">Bật thông báo trình duyệt</Link></>}</>
            : <>{saleName} {when}. Nhắc bạn đúng giờ sale kèm giá mới của món này.</>}
        </small>
        {err && <small className="form-error" role="alert">{err}</small>}
      </div>
      {loggedIn ? (
        <button type="button" className={`btn ${on ? "btn-ghost" : "btn-primary"} btn-sm`} onClick={toggle} disabled={busy} aria-pressed={on}>
          {on ? "Huỷ nhắc" : <><Icon name="bell" size={14} /> Nhắc tôi</>}
        </button>
      ) : (
        <Link className="btn btn-primary btn-sm" href={loginHref}><Icon name="bell" size={14} /> Nhắc tôi</Link>
      )}
    </div>
  );
}

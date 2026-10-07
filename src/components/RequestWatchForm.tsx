"use client";
import { useState } from "react";
import { Icon } from "./Icon";

/** Đăng ký báo khi link chưa có dữ liệu đã có lịch sử giá */
export function RequestWatchForm({ requestId, userEmail }: { requestId: number; userEmail?: string | null }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/request-watch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId, email }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Lỗi, thử lại sau");
      setDone(j.email);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }
  if (done) {
    return (
      <p className="rw-done" role="status">
        <Icon name="check" size={16} /> Sẽ báo về <b>{done}</b> ngay khi món này có lịch sử giá.
      </p>
    );
  }
  return (
    <form className="rw-form" onSubmit={submit}>
      {userEmail ? (
        <span className="muted" style={{ fontSize: 14 }}>Báo về {userEmail}</span>
      ) : (
        <>
          <label htmlFor="rw-email" className="sr-only">Email nhận báo</label>
          <input id="rw-email" className="input" type="email" required placeholder="Email của bạn" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </>
      )}
      <button className="btn btn-primary btn-sm" disabled={busy}><Icon name="bell" size={14} /> {busy ? "Đang lưu…" : "Báo cho tôi khi có lịch sử giá"}</button>
      {err && <span className="form-msg warn" role="alert">{err}</span>}
    </form>
  );
}

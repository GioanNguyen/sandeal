"use client";
import { useState } from "react";
import { Icon } from "./Icon";

/** Gửi thử tin tóm tắt buổi sáng (kiểm tra Telegram / email nhận báo) */
export function OpsTestButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/ops", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test" }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error ?? `Lỗi ${res.status}`);
      const via = (j.sent as string[]).map((c) => (c === "telegram" ? "Telegram" : "email")).join(" + ");
      setMsg(j.sent.length ? { ok: true, text: `Đã gửi qua ${via} – kiểm tra điện thoại / hộp thư` } : { ok: false, text: "Chưa gửi được: chưa có Telegram hay ADMIN_EMAILS" });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy(false);
  }
  return (
    <span className="demand-act">
      <button type="button" className="btn btn-ghost btn-sm" onClick={run} disabled={busy}><Icon name="send" size={14} /> {busy ? "Đang gửi…" : "Gửi thử tin tóm tắt"}</button>
      {msg && <span className={`vs ${msg.ok ? "vs-good" : "vs-poor"}`} role="status">{msg.text}</span>}
    </span>
  );
}

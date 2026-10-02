"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "./Icon";

export function IndexNowButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/indexnow", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setMsg({ ok: !!j.ok, text: j.sent ? `Đã gửi ${j.sent} trang (HTTP ${j.status})` : "Không có trang nào mới hoặc đổi từ lần gửi trước" });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="guide-ai-btns">
      <button type="button" className="btn btn-ghost btn-sm" onClick={run} disabled={busy}><Icon name="send" size={14} /> {busy ? "Đang gửi…" : "Gửi ngay"}</button>
      {msg && <span className={`vs ${msg.ok ? "vs-good" : "vs-poor"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</span>}
    </div>
  );
}

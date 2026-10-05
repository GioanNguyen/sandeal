"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "./Icon";

/** Nút "Soạn bài" theo từ khoá khách đang tìm: AI soạn bài nháp, quản trị viên duyệt ở Quản trị › Hướng dẫn */
export function DraftGuideButton({ q, aiOn, done }: { q: string; aiOn: boolean; done?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(done ? { ok: true, text: "Đã có bài" } : null);
  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/guide-ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "draft", q }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error ?? `Lỗi ${res.status}`);
      setMsg({ ok: true, text: "Đã soạn nháp" });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy(false);
  }
  if (msg?.ok) {
    return (
      <Link className="vs vs-good" href="/admin/huong-dan" title="Đọc và duyệt ở Quản trị › Hướng dẫn">
        <Icon name="check" size={13} /> {msg.text}
      </Link>
    );
  }
  return (
    <span className="demand-act">
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={run}
        disabled={busy || !aiOn}
        title={aiOn ? `AI soạn bài hướng dẫn về "${q}" từ giá thật trên site – bạn duyệt trước khi đăng` : "Cần ANTHROPIC_API_KEY"}
      >
        <Icon name="sparkles" size={14} /> {busy ? "Đang soạn… (~1 phút)" : "Soạn bài"}
      </button>
      {msg && <span className="vs vs-poor" role="alert">{msg.text}</span>}
    </span>
  );
}

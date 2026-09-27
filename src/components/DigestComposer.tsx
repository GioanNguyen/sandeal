"use client";
import { useState } from "react";
import { Icon } from "./Icon";

/** Bài tổng hợp nhiều deal cho Trang Facebook: sửa, chép hoặc đăng ngay */
export function DigestComposer({ caption, productIds, canPost }: { caption: string; productIds: number[]; canPost: boolean }) {
  const [text, setText] = useState(caption);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function post() {
    setBusy(true);
    const res = await fetch("/api/admin/social", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "facebook", productIds }),
    }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setMsg(res?.ok ? "Đã đăng lên Trang Facebook" : j?.error ?? "Lỗi");
    setBusy(false);
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setMsg("Đã chép nội dung");
    } catch {
      setMsg("Trình duyệt không cho chép, hãy chọn và chép thủ công");
    }
  }

  return (
    <article className="composer digest-composer">
      <div className="composer-body">
        <label className="sr-only" htmlFor="digest-caption">Nội dung bài tổng hợp</label>
        <textarea id="digest-caption" className="input" rows={16} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={copy}><Icon name="copy" size={14} /> Chép nội dung</button>
          {canPost && (
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={post}>
              <Icon name="send" size={14} /> {busy ? "Đang đăng…" : "Đăng Trang Facebook"}
            </button>
          )}
        </div>
        {canPost && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Nút đăng dùng nội dung gốc (tính lại giá mới nhất), không dùng phần bạn sửa trong ô – muốn đăng bản đã sửa thì chép và đăng tay.</p>}
        {msg && <p className="form-msg save" role="status" style={{ margin: 0 }}><Icon name="check" size={14} /> {msg}</p>}
      </div>
    </article>
  );
}

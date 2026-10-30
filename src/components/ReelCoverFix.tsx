"use client";
import { useEffect, useState } from "react";
import type { CoverFixState } from "@/worker/reels";

type S = CoverFixState & { posted?: number };

/** Quản trị › Đăng bài: đổi ảnh bìa (thẻ giá) cho các Reel đã đăng bị bìa đen – chạy 1 lần, chạy nền */
export function ReelCoverFix({ posted }: { posted: number }) {
  const [s, setS] = useState<S | null>(null);
  const [err, setErr] = useState("");
  const load = async () => {
    const res = await fetch("/api/admin/reel?covers=1", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setS(await res.json());
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!s?.running) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [s?.running]);
  async function start() {
    if (!confirm(`Đổi ảnh bìa cho ${posted} Reel đã đăng? Mỗi Reel được tải lại từ Facebook, cắt khung thẻ giá làm ảnh bìa (vài giây mỗi Reel, chạy nền).`)) return;
    setErr("");
    const res = await fetch("/api/admin/reel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "fix-covers" }) }).catch(() => null);
    if (!res?.ok) return setErr(`Lỗi ${res?.status ?? "mạng"}`);
    setS(await res.json());
  }
  if (!posted) return null;
  return (
    <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={start} disabled={!!s?.running}>
        {s?.running ? "Đang đổi ảnh bìa…" : `Đổi ảnh bìa cho ${posted} Reel đã đăng`}
      </button>
      {s && (s.running || s.finishedAt) && (
        <span className={s.lastError && !s.ok ? "vs vs-poor" : "muted"} role="status" style={{ fontSize: 14 }}>
          {s.running ? `${s.done}/${s.total}` : "Xong"}: {s.ok} đã đổi{s.skipped ? ` · ${s.skipped} bỏ qua (Reel đã xoá / không tải được)` : ""}{s.failed ? ` · ${s.failed} lỗi` : ""}
          {s.lastError ? ` · ${s.lastError}` : ""}
        </span>
      )}
      {err && <span className="vs vs-poor" role="alert">{err}</span>}
    </div>
  );
}

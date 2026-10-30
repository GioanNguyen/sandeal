"use client";
import { useCallback, useEffect, useState } from "react";
import type { CoverFixState, PostedReel } from "@/worker/reels";

type Reel = Omit<PostedReel, "postedAt"> & { postedAt: string };
type Data = { state: CoverFixState; reels: Reel[] };

const STATUS: Record<string, { label: string; cls: string }> = {
  ok: { label: "Đã đổi bìa", cls: "vs vs-good" },
  skipped: { label: "Bỏ qua", cls: "vs vs-needs-improvement" },
  failed: { label: "Lỗi", cls: "vs vs-poor" },
};
const dm = (s: string) => new Date(s).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });

/**
 * Quản trị › Đăng bài: đổi ảnh bìa (khung đầu: ảnh + tên sản phẩm) cho các Reel đã đăng bị bìa đen.
 * Đổi tất cả Reel chưa đổi / các Reel đã chọn / từng Reel; dừng được; xem kết quả và lỗi của từng Reel.
 */
export function ReelCoverFix({ posted }: { posted: number }) {
  const [d, setD] = useState<Data | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    const res = await fetch("/api/admin/reel?covers=1", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setD(await res.json());
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const running = !!d?.state.running;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [running, load]);

  async function call(body: Record<string, unknown>) {
    setErr("");
    const res = await fetch("/api/admin/reel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    if (!res?.ok) setErr(j?.error ?? `Lỗi ${res?.status ?? "mạng"}`);
    await load();
  }
  const start = (ids?: string[]) => call({ action: "fix-covers", ...(ids ? { ids } : {}) });

  if (!posted) return null;
  const reels = d?.reels ?? [];
  const todo = reels.filter((r) => r.cover?.status !== "ok").length;
  const s = d?.state;
  const toggle = (id: string) => setSel((x) => {
    const n = new Set(x);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  return (
    <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
      <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <b style={{ marginRight: 4 }}>Ảnh bìa Reel đã đăng</b>
        {!running ? (
          <>
            <button type="button" className="btn btn-ghost btn-sm" disabled={!todo} onClick={() => confirm(`Đổi ảnh bìa cho ${todo} Reel chưa đổi? Mỗi Reel được tải lại từ Facebook, cắt khung đầu (ảnh + tên sản phẩm) làm bìa, vài giây mỗi Reel.`) && start()}>
              Đổi tất cả Reel chưa đổi ({todo})
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={!sel.size} onClick={() => start([...sel])}>
              Đổi các Reel đã chọn ({sel.size})
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" disabled={s?.stopping} onClick={() => call({ action: "stop-covers" })}>
            {s?.stopping ? "Đang dừng…" : "Dừng"}
          </button>
        )}
        {err && <span className="vs vs-poor" role="alert">{err}</span>}
      </div>
      {s && (s.running || s.finishedAt) && (
        <p className={s.stoppedReason && !s.ok ? "form-msg" : "muted"} role="status" style={{ margin: 0, fontSize: 14 }}>
          {s.running ? `Đang chạy ${s.done}/${s.total}` : `Lần chạy gần nhất (${dm(s.finishedAt!)}): ${s.done}/${s.total}`} · {s.ok} đã đổi
          {s.skipped ? ` · ${s.skipped} bỏ qua` : ""}{s.failed ? ` · ${s.failed} lỗi` : ""}
          {s.stoppedReason ? <><br />{s.stoppedReason}</> : s.lastError ? <><br />Lỗi gần nhất: {s.lastError}</> : null}
        </p>
      )}
      <details>
        <summary style={{ cursor: "pointer", fontSize: 14 }}>Danh sách {reels.length} Reel đã đăng – chọn từng Reel</summary>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col" style={{ width: 32 }}>
                  <input type="checkbox" aria-label="Chọn tất cả" checked={!!reels.length && sel.size === reels.length} onChange={(e) => setSel(e.target.checked ? new Set(reels.map((r) => r.videoId)) : new Set())} />
                </th>
                <th scope="col">Món</th>
                <th scope="col">Đăng lúc</th>
                <th scope="col">Ảnh bìa</th>
                <th scope="col"><span className="sr-only">Đổi bìa</span></th>
              </tr>
            </thead>
            <tbody>
              {reels.map((r) => {
                const now = running && s?.current === r.videoId;
                const st = r.cover ? STATUS[r.cover.status] : null;
                return (
                  <tr key={r.videoId}>
                    <td><input type="checkbox" aria-label={`Chọn ${r.name}`} checked={sel.has(r.videoId)} onChange={() => toggle(r.videoId)} /></td>
                    <td style={{ wordBreak: "break-word" }}>
                      {r.name} <a href={`https://www.facebook.com/reel/${r.videoId}`} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>Xem Reel</a>
                    </td>
                    <td className="nw">{dm(r.postedAt)}</td>
                    <td style={{ fontSize: 13 }}>
                      {now ? <span className="vs">Đang đổi…</span> : st ? <span className={st.cls}>{st.label}</span> : <span className="muted">Chưa đổi</span>}
                      {!now && r.cover?.error && r.cover.status !== "ok" && <div className="muted" style={{ wordBreak: "break-word" }}>{r.cover.error}</div>}
                    </td>
                    <td className="nw">
                      <button type="button" className="btn btn-ghost btn-sm" disabled={running} onClick={() => start([r.videoId])}>Đổi bìa</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

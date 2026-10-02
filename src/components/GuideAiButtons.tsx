"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "./Icon";

type Action = "draft" | "approve" | "reject" | "redo" | "unschedule";
const BUSY: Record<Action, string> = {
  draft: "Đang soạn bài (khoảng 1 phút)…",
  redo: "Đang soạn bài khác (khoảng 1 phút)…",
  approve: "Đang xếp lịch…",
  reject: "Đang bỏ…",
  unschedule: "Đang huỷ lịch…",
};

/** Nút cho bài nháp AI soạn: Duyệt / Bỏ / Soạn bài khác; hoặc "Soạn bài nháp ngay"; hoặc "Huỷ lịch" bài đã duyệt */
export function GuideAiButtons({ id, mode }: { id?: number; mode: "draft" | "new" | "scheduled" }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(action: Action) {
    if (action === "reject" && !confirm("Bỏ bài nháp này? Bài sẽ không được đăng.")) return;
    if (action === "redo" && !confirm("Bỏ bài này và để AI soạn một bài khác?")) return;
    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/guide-ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setMsg({
        ok: true,
        text: action === "approve" ? `Đã duyệt – bài sẽ đăng lúc 8h ngày ${String(j.day).split("-").reverse().join("/")}` : action === "draft" || action === "redo" ? `Đã soạn: ${j.title}` : "Xong",
      });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="guide-ai-btns">
      {mode === "draft" && (
        <>
          <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => run("approve")}><Icon name="check" size={14} /> Duyệt</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => run("redo")}><Icon name="refresh" size={14} /> Soạn bài khác</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => run("reject")}><Icon name="trash" size={14} /> Bỏ</button>
        </>
      )}
      {mode === "new" && (
        <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => run("draft")}><Icon name="sparkles" size={14} /> Soạn bài nháp ngay</button>
      )}
      {mode === "scheduled" && (
        <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => run("unschedule")}>Huỷ lịch</button>
      )}
      {busy && <span className="muted" role="status">{BUSY[busy]}</span>}
      {msg && <span className={`vs ${msg.ok ? "vs-good" : "vs-poor"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</span>}
    </div>
  );
}

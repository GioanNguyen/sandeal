"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "./Icon";

const REASONS = ["Giá sai", "Link hỏng", "Hàng cấm / không phù hợp", "Trùng món khác", "Hàng giả / shop kém"];

/**
 * Nút thao tác 1 món trong Quản trị › Sản phẩm: kiểm tra lại trên sàn, ẩn (kèm lý do), hiện lại, xoá hẳn.
 * "Xoá hẳn" chỉ hiện với món không có dữ liệu quan trọng (deletable) và phải bấm 2 lần để chắc chắn.
 */
export function ProductAdminActions({ id, hidden, deletable = false, keepReason = "" }: { id: number; hidden: boolean; deletable?: boolean; keepReason?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [confirmDel, setConfirmDel] = useState(false);

  async function run(action: "recheck" | "hide" | "unhide" | "delete") {
    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, reason }) });
      const j = await res.json().catch(() => ({}));
      if (action === "recheck") setMsg(j.ok ? { ok: true, text: "Đã cập nhật từ sàn" } : { ok: false, text: j.error ?? `Lỗi ${res.status}` });
      else if (!res.ok) setMsg({ ok: false, text: j.error ?? `Lỗi ${res.status}` });
      else if (action === "delete") setMsg({ ok: true, text: "Đã xoá" });
      setConfirmDel(false);
      setAsking(false);
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="pa-actions">
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => run("recheck")} disabled={!!busy} title="Tra cứu lại giá và tình trạng trên sàn">
        <Icon name="refresh" size={14} /> {busy === "recheck" ? "Đang kiểm tra…" : "Kiểm tra lại"}
      </button>
      {hidden ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => run("unhide")} disabled={!!busy}>
          <Icon name="eye" size={14} /> {busy === "unhide" ? "Đang hiện…" : "Hiện lại"}
        </button>
      ) : asking ? (
        <span className="pa-hide">
          <label className="sr-only" htmlFor={`r${id}`}>Lý do ẩn</label>
          <input id={`r${id}`} className="input input-sm" list="pa-reasons" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
          <datalist id="pa-reasons">{REASONS.map((r) => <option key={r} value={r} />)}</datalist>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => run("hide")} disabled={!!busy}>{busy === "hide" ? "Đang ẩn…" : "Ẩn"}</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAsking(false)}>Huỷ</button>
        </span>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAsking(true)} disabled={!!busy}>
          <Icon name="alert" size={14} /> Ẩn khỏi web
        </button>
      )}
      {deletable ? (
        confirmDel ? (
          <span className="pa-hide">
            <button type="button" className="btn btn-danger btn-sm" onClick={() => run("delete")} disabled={!!busy} title="Xoá cả lịch sử giá, lượt xem của món – không lấy lại được">
              {busy === "delete" ? "Đang xoá…" : "Bấm lần nữa để xoá hẳn"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDel(false)}>Huỷ</button>
          </span>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDel(true)} disabled={!!busy} title="Chỉ món không có người theo dõi, lượt bấm mua, đơn hàng hay bài đã đăng">
            <Icon name="trash" size={14} /> Xoá hẳn
          </button>
        )
      ) : keepReason ? (
        <span className="muted" style={{ fontSize: 12 }} title="Món có dữ liệu quan trọng nên chỉ ẩn được, không xoá hẳn">Giữ dữ liệu: {keepReason}</span>
      ) : null}
      {msg && <span className={`vs ${msg.ok ? "vs-good" : "vs-poor"}`} role="status">{msg.text}</span>}
    </div>
  );
}

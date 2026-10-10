"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";

type Action = "category" | "hide" | "unhide" | "recheck" | "delete";

const boxes = () => Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"][form="bulk"][name="id"]'));

/**
 * Thanh thao tác hàng loạt cho Quản trị › Sản phẩm: các ô chọn của từng món gắn vào form "bulk" (thuộc tính form=),
 * nên danh sách vẫn render phía máy chủ.
 */
export function ProductBulkBar({ total, filter, categories }: { total: number; filter: Record<string, string | undefined>; categories: string[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(0);
  const [scope, setScope] = useState<"selected" | "all">("selected");
  const [action, setAction] = useState<Action>("category");
  const [category, setCategory] = useState("");
  const [reason, setReason] = useState("Giá sai");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const count = () => setSelected(boxes().filter((b) => b.checked).length);
    document.addEventListener("change", count);
    count();
    return () => document.removeEventListener("change", count);
  }, []);

  const toggleAll = () => {
    const list = boxes();
    const on = list.some((b) => !b.checked);
    list.forEach((b) => (b.checked = on));
    setSelected(on ? list.length : 0);
  };

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    const n = scope === "all" ? total : selected;
    if (!n) return setMsg({ ok: false, text: "Chưa chọn món nào" });
    if (action === "category" && !category.trim()) return setMsg({ ok: false, text: "Chọn hoặc gõ tên danh mục" });
    const label = action === "category" ? `gán danh mục "${category.trim()}"` : action === "hide" ? "ẩn khỏi web" : action === "unhide" ? "hiện lại" : action === "delete" ? "xoá hẳn" : "kiểm tra lại trên sàn";
    // Xoá hẳn không lấy lại được: luôn hỏi lại
    if (action === "delete" && !confirm(`Xoá hẳn ${scope === "all" ? "TẤT CẢ " : ""}${n.toLocaleString("vi-VN")} món (cả lịch sử giá, lượt xem)? Không lấy lại được.\nMón có người theo dõi giá, nhắc sale, lượt bấm mua, đơn hàng hoặc bài đã đăng sẽ được giữ lại.`)) return;
    if (action !== "delete" && scope === "all" && !confirm(`Áp dụng "${label}" cho TẤT CẢ ${n.toLocaleString("vi-VN")} món khớp bộ lọc?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const ids = boxes().filter((b) => b.checked).map((b) => Number(b.value));
      const res = await fetch("/api/admin/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, category, reason, ...(scope === "all" ? { filter } : { ids }) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error ?? `Lỗi ${res.status}`);
      const keptText = j.kept
        ? ` · giữ lại ${Number(j.kept).toLocaleString("vi-VN")} món có dữ liệu (${Object.entries(j.keptBy as Record<string, number>).map(([k, v]) => `${v} có ${k}`).join(", ")}) – chỉ ẩn được`
        : "";
      setMsg({
        ok: true,
        text:
          action === "recheck"
            ? `Đã kiểm tra ${j.checked} món, cập nhật được ${j.updated}`
            : action === "delete"
              ? `Đã xoá ${Number(j.deleted).toLocaleString("vi-VN")} món${keptText}`
              : `Đã cập nhật ${Number(j.updated).toLocaleString("vi-VN")} món`,
      });
      boxes().forEach((b) => (b.checked = false));
      setSelected(0);
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="bulk" className="bulk-bar" onSubmit={apply}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={toggleAll}><Icon name="check" size={14} /> Chọn cả trang</button>
      <span className="bulk-scope" role="radiogroup" aria-label="Áp dụng cho">
        <label><input type="radio" name="scope" checked={scope === "selected"} onChange={() => setScope("selected")} /> {selected} món đã chọn</label>
        <label><input type="radio" name="scope" checked={scope === "all"} onChange={() => setScope("all")} /> Tất cả {total.toLocaleString("vi-VN")} món khớp bộ lọc</label>
      </span>
      <label className="sr-only" htmlFor="bulk-action">Thao tác</label>
      <select id="bulk-action" className="input" value={action} onChange={(e) => setAction(e.target.value as Action)}>
        <option value="category">Gán danh mục</option>
        <option value="hide">Ẩn khỏi web</option>
        <option value="unhide">Hiện lại</option>
        <option value="recheck">Kiểm tra lại trên sàn (tối đa 30)</option>
        <option value="delete">Xoá hẳn (món không có dữ liệu quan trọng)</option>
      </select>
      {action === "category" && (
        <>
          <label className="sr-only" htmlFor="bulk-cat">Danh mục</label>
          <input id="bulk-cat" className="input" list="bulk-cats" placeholder="Chọn hoặc gõ danh mục" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={80} />
          <datalist id="bulk-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </>
      )}
      {action === "hide" && (
        <>
          <label className="sr-only" htmlFor="bulk-reason">Lý do ẩn</label>
          <input id="bulk-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Lý do ẩn" />
        </>
      )}
      <button className={`btn btn-sm ${action === "delete" ? "btn-danger" : "btn-primary"}`} disabled={busy}>{busy ? "Đang áp dụng…" : action === "delete" ? "Xoá hẳn" : "Áp dụng"}</button>
      {msg && <span className={`vs ${msg.ok ? "vs-good" : "vs-poor"}`} role="status">{msg.text}</span>}
    </form>
  );
}

/** Nút chạy ngay việc tự xếp danh mục / lấy ảnh (bình thường chạy tự động mỗi giờ) */
export function DataFillTools({ canFetchImages }: { canFetchImages: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(action: "autocat" | "images") {
    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/products/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error ?? `Lỗi ${res.status}`);
      setMsg({
        ok: true,
        text:
          action === "autocat"
            ? `Đã xếp ${j.byRules + j.byAi} món (từ khoá ${j.byRules}, AI ${j.byAi})${j.normalized ? `, gộp tên ${j.normalized}` : ""} · còn ${j.left} món chưa có danh mục${j.aiError ? ` · AI lỗi: ${j.aiError}` : ""}`
            : `Đã lấy ảnh ${j.filled}/${j.checked} món`,
      });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="pa-actions">
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => run("autocat")} disabled={!!busy}>
        <Icon name="sparkles" size={14} /> {busy === "autocat" ? "Đang xếp…" : "Tự xếp danh mục ngay"}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => run("images")} disabled={!!busy || !canFetchImages} title={canFetchImages ? undefined : "Cần SHOPEE_APP_ID, SHOPEE_SECRET"}>
        <Icon name="image" size={14} /> {busy === "images" ? "Đang lấy ảnh…" : "Lấy ảnh ngay"}
      </button>
      {msg && <span className={`vs ${msg.ok ? "vs-good" : "vs-poor"}`} role="status">{msg.text}</span>}
    </div>
  );
}

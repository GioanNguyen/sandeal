"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";

/**
 * Quản trị › Sản phẩm, bộ lọc "Chưa có link affiliate": xuất link sản phẩm -> tạo link hàng loạt trên Shopee Affiliate ->
 * tải file kết quả (hoặc dán) lên đây để thay link mua.
 */
export function AffLinkTool({ total, noLink }: { total: number; noLink: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();

  async function send(files: FileList | null) {
    const body = new FormData();
    for (const f of Array.from(files ?? [])) body.append("file", f);
    if (text.trim()) body.append("text", text);
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/products/aff-links", { method: "POST", body });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) return setMsg({ ok: false, text: r.error ?? `Lỗi ${res.status}` });
      const extra = [r.notFound && `${r.notFound} link không khớp món nào trên web`, r.noOrigin && `${r.noOrigin} dòng thiếu link sản phẩm gốc`].filter(Boolean).join(" · ");
      setMsg({ ok: true, text: `Đã thay link affiliate cho ${r.updated} món${extra ? ` · ${extra}` : ""}` });
      setText("");
      router.refresh();
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <section className="panel aff-tool" aria-labelledby="aff-h">
      <h2 id="aff-h">Thay link affiliate hàng loạt</h2>
      <p className="muted" style={{ margin: "0 0 12px", fontSize: 14 }}>
        {total.toLocaleString("vi-VN")} món Shopee đang dùng link sản phẩm thường – khách bấm “Mua” không tính hoa hồng.
        {noLink ? ` ${noLink} món không xuất được vì chưa biết link sản phẩm đầy đủ (chạy tiện ích để lấy link).` : ""}
      </p>
      <ol className="aff-steps">
        <li>
          <b>Tải danh sách link</b>{" "}
          <a className="btn btn-ghost btn-sm" href="/api/admin/products/aff-links?format=txt" download><Icon name="download" size={14} /> Văn bản (mỗi dòng 1 link)</a>{" "}
          <a className="btn btn-ghost btn-sm" href="/api/admin/products/aff-links?format=csv" download><Icon name="download" size={14} /> CSV</a>
        </li>
        <li>Trên <b>Shopee Affiliate › Link tuỳ chỉnh</b>, tạo link hàng loạt từ danh sách đó rồi tải về file kết quả (có cả link gốc và link s.shopee.vn).</li>
        <li>
          <b>Tải file kết quả lên</b>{" "}
          <input ref={input} type="file" accept=".csv,.txt,text/csv,text/plain" multiple hidden onChange={(e) => send(e.target.files)} />
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Đang thay…" : "Chọn file"}</button>
          <details style={{ marginTop: 8 }}>
            <summary className="muted" style={{ fontSize: 14, cursor: "pointer" }}>hoặc dán các dòng chép từ Excel / trang Shopee</summary>
            <label className="sr-only" htmlFor="aff-paste">Dán các dòng có link sản phẩm và link affiliate</label>
            <textarea id="aff-paste" className="input" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={"https://shopee.vn/product/123/456\thttps://s.shopee.vn/AbC123"} style={{ width: "100%", marginTop: 6, fontFamily: "ui-monospace, monospace", fontSize: 13 }} />
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || !text.trim()} onClick={() => send(null)} style={{ marginTop: 6 }}>{busy ? "Đang thay…" : "Thay link"}</button>
          </details>
        </li>
      </ol>
      {msg && <p className={`form-msg ${msg.ok ? "ok" : "warn"}`} role="status" style={{ marginBottom: 0 }}>{msg.text}</p>}
    </section>
  );
}

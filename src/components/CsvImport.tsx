"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Nhập file CSV "Lấy link sản phẩm hàng loạt" của Shopee Affiliate (khi chưa có Open API) */
export function CsvImport() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const router = useRouter();
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const body = new FormData();
    for (const f of Array.from(files)) body.append("file", f);
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/admin/import-csv", { method: "POST", body });
    const r = await res.json().catch(() => ({}));
    setBusy(false);
    if (input.current) input.current.value = "";
    if (!res.ok) return setMsg(r.error ?? "Lỗi");
    const skipped = r.skipped?.length ? ` · bỏ qua ${r.skipped.length} dòng (${r.skipped.slice(0, 3).map((s: { line: number; reason: string }) => `dòng ${s.line}: ${s.reason}`).join("; ")})` : "";
    setMsg(`Đã nhập ${r.imported} sản phẩm (${r.created} mới, ${r.updated} cập nhật)${r.noImage ? ` · ${r.noImage} món chưa có ảnh` : ""}${skipped}`);
    router.refresh();
  };
  return (
    <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
      <input ref={input} type="file" accept=".csv,text/csv" multiple hidden onChange={(e) => upload(e.target.files)} />
      <button className="btn btn-ghost" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? "Đang nhập…" : "Nhập CSV Shopee"}
      </button>
      {msg && <span className="muted" role="status" style={{ fontSize: 14 }}>{msg}</span>}
    </div>
  );
}

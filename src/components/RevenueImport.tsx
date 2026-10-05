"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Icon } from "./Icon";

/** Nhập tệp CSV báo cáo hoa hồng của Shopee Affiliate + nút ghép lại đơn với lượt bấm */
export function RevenueImport() {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const body = new FormData();
    for (const f of Array.from(files)) body.append("file", f);
    setBusy("csv");
    setMsg(null);
    try {
      const res = await fetch("/api/admin/revenue", { method: "POST", body });
      const r = await res.json().catch(() => ({}));
      if (!res.ok || !r.ok) throw new Error(r.error ?? `Lỗi ${res.status}`);
      const skipped = r.skippedCount ? ` · bỏ qua ${r.skippedCount} dòng (${r.skipped.slice(0, 2).map((s: { line: number; reason: string }) => `dòng ${s.line}: ${s.reason}`).join("; ")})` : "";
      setMsg({ ok: true, text: `Đã nhập ${r.orders} đơn, ${r.lines} dòng sản phẩm · ghép được ${r.matched} dòng với lượt bấm trên site${skipped}` });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }
  async function reattribute() {
    setBusy("att");
    setMsg(null);
    try {
      const res = await fetch("/api/admin/revenue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "attribute" }) });
      const r = await res.json().catch(() => ({}));
      if (!res.ok || !r.ok) throw new Error(r.error ?? `Lỗi ${res.status}`);
      setMsg({ ok: true, text: `Đã ghép lại ${r.total} dòng, ${r.matched} dòng tìm được lượt bấm` });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="pa-actions">
      <input ref={input} type="file" accept=".csv,text/csv" multiple hidden onChange={(e) => upload(e.target.files)} />
      <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => input.current?.click()}>
        <Icon name="download" size={14} /> {busy === "csv" ? "Đang nhập…" : "Nhập CSV báo cáo hoa hồng"}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={reattribute} title="Ghép lại đơn 90 ngày với món và lượt bấm (sau khi nhập thêm sản phẩm)">
        <Icon name="refresh" size={14} /> {busy === "att" ? "Đang ghép…" : "Ghép lại đơn"}
      </button>
      {msg && <span className={`vs ${msg.ok ? "vs-good" : "vs-poor"} rev-msg`} role="status">{msg.text}</span>}
    </div>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";

export function SyncButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const router = useRouter();
  return (
    <div className="row" style={{ gap: 10 }}>
      <button
        className="btn btn-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg("");
          const res = await fetch("/api/admin/sync", { method: "POST" });
          const r = await res.json().catch(() => ({}));
          setBusy(false);
          setMsg(res.ok ? `Xong: ${r.products} sản phẩm, ${r.vouchers} mã, ${r.emails} email${r.errors?.length ? ` · Lỗi: ${r.errors.join("; ")}` : ""}` : r.error ?? "Lỗi");
          router.refresh();
        }}
      >
        <Icon name="refresh" size={16} /> {busy ? "Đang đồng bộ…" : "Đồng bộ ngay"}
      </button>
      {msg && <span className="muted" role="status" style={{ fontSize: 14 }}>{msg}</span>}
    </div>
  );
}

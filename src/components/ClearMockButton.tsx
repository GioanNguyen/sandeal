"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Xoá sản phẩm, mã, đơn hàng… mẫu (chỉ hiện khi DB còn dữ liệu mẫu) */
export function ClearMockButton({ count }: { count: number }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const router = useRouter();
  return (
    <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
      <button
        className="btn btn-ghost"
        disabled={busy}
        onClick={async () => {
          if (!window.confirm(`Xoá ${count} sản phẩm mẫu cùng mã giảm giá, đơn hàng, lượt bấm và người dùng demo? Dữ liệu thật không bị ảnh hưởng.`)) return;
          setBusy(true);
          setMsg("");
          const res = await fetch("/api/admin/clear-mock", { method: "POST" });
          const r = await res.json().catch(() => ({}));
          setBusy(false);
          setMsg(res.ok ? `Đã xoá ${r.products} sản phẩm, ${r.vouchers} mã, ${r.conversions} đơn, ${r.clicks} lượt bấm, ${r.users} người dùng demo` : r.error ?? "Lỗi");
          router.refresh();
        }}
      >
        {busy ? "Đang xoá…" : `Xoá dữ liệu mẫu (${count})`}
      </button>
      {msg && <span className="muted" role="status" style={{ fontSize: 14 }}>{msg}</span>}
    </div>
  );
}

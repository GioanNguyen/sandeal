"use client";
import { useState } from "react";
import Link from "next/link";
import { Icon } from "./Icon";

const MESSAGES = {
  saved: "Đã lưu! Bạn sẽ nhận email khi giá chạm mức này.",
  verify: "Gần xong! Mở email và bấm link xác nhận để bắt đầu theo dõi.",
};

export interface WatchVariant { id: number; name: string; price: number; low: number }

/** Giá gợi ý: thấp hơn đáy 90 ngày 2%, làm tròn nghìn */
const suggest = (low: number) => Math.round((low * 0.98) / 1000) * 1000;

export function WatchForm({
  productId, suggested, userEmail, initial, variants = [], initialVariant,
}: {
  productId: number; suggested: number; userEmail?: string; initial?: { status?: string; msg?: string };
  /** Phân loại đã ghi nhận giá: cho chọn theo dõi riêng một phân loại */
  variants?: WatchVariant[]; initialVariant?: number;
}) {
  const [variantId, setVariantId] = useState<number | "">(variants.some((v) => v.id === initialVariant) ? initialVariant! : "");
  const [target, setTarget] = useState(() => {
    const v = variants.find((x) => x.id === initialVariant);
    return v ? suggest(v.low) : suggested;
  });
  const init = initial?.status === "saved" || initial?.status === "verify" ? "ok" : initial?.status === "error" ? "error" : "idle";
  const [state, setState] = useState<"idle" | "saving" | "ok" | "error">(init);
  const [msg, setMsg] = useState(
    initial?.status === "saved" || initial?.status === "verify" ? MESSAGES[initial.status] : initial?.status === "error" ? initial.msg ?? "Có lỗi" : "",
  );

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState("saving");
    try {
      const res = await fetch("/api/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          email: f.get("email"),
          targetPrice: Number(f.get("targetPrice")),
          variantId: variantId || undefined,
          website: f.get("website"), // bẫy bot
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        setMsg(json.error ?? "Có lỗi, thử lại sau.");
        return;
      }
      setState("ok");
      setMsg(json.mode === "saved" ? MESSAGES.saved : MESSAGES.verify);
    } catch {
      setState("error");
      setMsg("Không kết nối được, thử lại sau.");
    }
  }

  return (
    <form data-no-progress className={`watch-form${userEmail ? " logged-in" : ""}`} onSubmit={submit} method="post" action="/api/watch">
      <input type="hidden" name="productId" value={productId} />
      {userEmail ? (
        <p className="muted" style={{ gridColumn: "1 / -1", margin: 0, fontSize: 14 }}>
          Gửi tới <b>{userEmail}</b> · <Link href="/account" style={{ color: "var(--primary)", fontWeight: 600 }}>Quản lý theo dõi</Link>
        </p>
      ) : (
        <div className="field">
          <label htmlFor="w-email">Email</label>
          <input id="w-email" className="input" name="email" type="email" required autoComplete="email" placeholder="ban@email.com" />
        </div>
      )}
      {variants.length > 0 && (
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="w-variant">Phân loại</label>
          <select
            id="w-variant"
            className="select"
            name="variantId"
            value={variantId}
            onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : "";
              setVariantId(id);
              const v = variants.find((x) => x.id === id);
              setTarget(v ? suggest(v.low) : suggested);
            }}
          >
            <option value="">Giá chung (thường là phân loại rẻ nhất)</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>{v.name} – {new Intl.NumberFormat("vi-VN").format(v.price)} đ</option>
            ))}
          </select>
        </div>
      )}
      <div className="field">
        <label htmlFor="w-price">Giá mong muốn (đ)</label>
        <input id="w-price" className="input" name="targetPrice" type="number" inputMode="numeric" min={1000} step={1000} required value={target} onChange={(e) => setTarget(Number(e.target.value))} />
      </div>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hp" />
      <button className="btn btn-primary" disabled={state === "saving"}>
        <Icon name="bell" size={16} /> {state === "saving" ? "Đang lưu…" : "Theo dõi giá"}
      </button>
      {msg && (
        <p className={`form-msg ${state === "ok" ? "save" : "warn"}`} role="status">
          <Icon name={state === "ok" ? "check" : "alert"} size={16} /> {msg}
        </p>
      )}
    </form>
  );
}

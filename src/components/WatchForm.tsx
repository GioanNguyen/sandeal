"use client";
import { useState } from "react";
import Link from "next/link";
import { Icon } from "./Icon";

const MESSAGES = {
  saved: "Đã lưu! Bạn sẽ nhận email khi giá chạm mức này.",
  verify: "Gần xong! Mở email và bấm link xác nhận để bắt đầu theo dõi.",
};

export function WatchForm({
  productId, suggested, userEmail, initial,
}: { productId: number; suggested: number; userEmail?: string; initial?: { status?: string; msg?: string } }) {
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
    <form className={`watch-form${userEmail ? " logged-in" : ""}`} onSubmit={submit} method="post" action="/api/watch">
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
      <div className="field">
        <label htmlFor="w-price">Giá mong muốn (đ)</label>
        <input id="w-price" className="input" name="targetPrice" type="number" inputMode="numeric" min={1000} step={1000} required defaultValue={suggested} />
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

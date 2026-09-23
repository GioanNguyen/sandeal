"use client";
import { useState } from "react";
import { Icon } from "./Icon";

export function WatchForm({ productId, suggested }: { productId: number; suggested: number }) {
  const [state, setState] = useState<"idle" | "saving" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState("saving");
    try {
      const res = await fetch("/api/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, email: f.get("email"), targetPrice: Number(f.get("targetPrice")) }),
      });
      const json = await res.json().catch(() => ({}));
      setState(res.ok ? "ok" : "error");
      setMsg(res.ok ? "Đã lưu! Bạn sẽ nhận email khi giá chạm mức này." : json.error ?? "Có lỗi, thử lại sau.");
    } catch {
      setState("error");
      setMsg("Không kết nối được, thử lại sau.");
    }
  }

  return (
    <form className="watch-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="w-email">Email</label>
        <input id="w-email" className="input" name="email" type="email" required autoComplete="email" placeholder="ban@email.com" />
      </div>
      <div className="field">
        <label htmlFor="w-price">Giá mong muốn (đ)</label>
        <input id="w-price" className="input" name="targetPrice" type="number" inputMode="numeric" min={1000} step={1000} required defaultValue={suggested} />
      </div>
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

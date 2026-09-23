"use client";
import { useState } from "react";

export function WatchForm({ productId, suggested }: { productId: number; suggested: number }) {
  const [state, setState] = useState<"idle" | "saving" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState("saving");
    const res = await fetch("/api/watch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, email: f.get("email"), targetPrice: Number(f.get("targetPrice")) }),
    });
    const json = await res.json().catch(() => ({}));
    setState(res.ok ? "ok" : "error");
    setMsg(res.ok ? "Đã lưu! Bạn sẽ nhận email khi giá chạm mức này." : json.error ?? "Có lỗi, thử lại sau.");
  }

  return (
    <form className="form" onSubmit={submit}>
      <input name="email" type="email" required placeholder="Email của bạn" />
      <input name="targetPrice" type="number" min={1000} step={1000} required defaultValue={suggested} />
      <button className="primary" disabled={state === "saving"}>{state === "saving" ? "Đang lưu…" : "Theo dõi"}</button>
      {msg && <p className={state === "ok" ? "good" : "warn"} style={{ width: "100%", margin: 0 }}>{msg}</p>}
    </form>
  );
}

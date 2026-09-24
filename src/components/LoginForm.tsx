"use client";
import { useState } from "react";
import { Icon } from "./Icon";

export function LoginForm({ sent = false, error = "", next }: { sent?: boolean; error?: string; next?: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(sent ? "sent" : error ? "error" : "idle");
  const [msg, setMsg] = useState(error);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState("sending");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: f.get("email"), website: f.get("website"), next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Có lỗi, thử lại sau.");
      setState("sent");
    } catch (err) {
      setState("error");
      setMsg((err as Error).message);
    }
  }

  if (state === "sent") {
    return (
      <p className="form-msg save" role="status" style={{ justifyContent: "center" }}>
        <Icon name="check" size={18} /> Đã gửi! Mở email và bấm link để đăng nhập.
      </p>
    );
  }
  return (
    <form onSubmit={submit} className="stack" method="post" action="/api/login" data-no-progress>
      <div className="field">
        <label htmlFor="l-email">Email</label>
        <input id="l-email" className="input" name="email" type="email" required autoComplete="email" placeholder="ban@email.com" />
      </div>
      {next && <input type="hidden" name="next" value={next} />}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hp" />
      <button className="btn btn-primary btn-block" disabled={state === "sending"}>
        <Icon name="mail" size={16} /> {state === "sending" ? "Đang gửi…" : "Gửi link đăng nhập"}
      </button>
      {state === "error" && <p className="form-msg warn" role="alert"><Icon name="alert" size={16} /> {msg}</p>}
    </form>
  );
}

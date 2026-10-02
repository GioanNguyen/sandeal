"use client";
import { useState } from "react";
import { Icon } from "./Icon";

/** Đăng link 1 bài hướng dẫn lên Trang Facebook ngay (trang quản trị) */
export function GuideShareButton({ slug, again = false }: { slug: string; again?: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");
  async function share() {
    if (!confirm(again ? "Bài này đã đăng rồi. Đăng lại lên Trang Facebook?" : "Đăng bài hướng dẫn này lên Trang Facebook ngay?")) return;
    setState("busy");
    try {
      const res = await fetch("/api/admin/guide-share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setState("ok");
      setMsg("Đã đăng");
    } catch (e) {
      setState("error");
      setMsg((e as Error).message);
    }
  }
  if (state === "ok") return <span className="vs vs-good"><Icon name="check" size={13} /> {msg}</span>;
  return (
    <span className="guide-share">
      <button type="button" className="btn btn-ghost btn-sm" onClick={share} disabled={state === "busy"}>
        <Icon name="send" size={14} /> {state === "busy" ? "Đang đăng…" : again ? "Đăng lại" : "Đăng Facebook"}
      </button>
      {state === "error" && <span className="vs vs-poor" role="alert">{msg}</span>}
    </span>
  );
}

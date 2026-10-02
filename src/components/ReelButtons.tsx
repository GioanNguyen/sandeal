"use client";
import { useState } from "react";
import { Icon } from "./Icon";

/** Xem thử / tải / đăng Reel cho 1 món (trang quản trị) */
export function ReelButtons({ productId, canPost }: { productId: number; canPost: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [video, setVideo] = useState<string | null>(null);

  async function preview() {
    setState("busy");
    setMsg("Đang dựng video (khoảng 20–40 giây)…");
    try {
      const res = await fetch(`/api/admin/reel?id=${productId}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      if (video) URL.revokeObjectURL(video);
      setVideo(URL.createObjectURL(await res.blob()));
      setState("idle");
      setMsg("");
    } catch (e) {
      setState("error");
      setMsg((e as Error).message);
    }
  }

  async function post() {
    if (!confirm("Đăng Reel của món này lên Trang Facebook ngay?")) return;
    setState("busy");
    setMsg("Đang dựng và đăng Reel…");
    try {
      const res = await fetch("/api/admin/reel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setState("ok");
      setMsg("Đã đăng Reel lên Trang.");
    } catch (e) {
      setState("error");
      setMsg((e as Error).message);
    }
  }

  return (
    <div className="reel-btns">
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={preview} disabled={state === "busy"}>
          <Icon name="eye" size={14} /> Xem thử Reel
        </button>
        <a className="btn btn-ghost btn-sm" href={`/api/admin/reel?id=${productId}&download=1`}>
          <Icon name="download" size={14} /> Tải video (TikTok)
        </a>
        {canPost && (
          <button type="button" className="btn btn-primary btn-sm" onClick={post} disabled={state === "busy"}>
            Đăng Reel
          </button>
        )}
      </div>
      {msg && <p className={`form-msg ${state === "ok" ? "save" : state === "error" ? "warn" : ""}`} role="status">{msg}</p>}
      {video && <video src={video} controls playsInline className="reel-preview" />}
    </div>
  );
}

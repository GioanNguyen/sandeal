"use client";
import { useState } from "react";
import { Icon } from "./Icon";

/** Một bài đăng gợi ý: ảnh xem trước, nội dung, sao chép, đăng ngay hoặc đánh dấu đã đăng */
export function SocialComposer({ productId, name, caption, image, link, connected }: {
  productId: number; name: string; caption: string; image: string; link: string; connected: string[];
}) {
  const [text, setText] = useState(caption);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");

  async function act(channel: string) {
    setBusy(channel);
    const res = await fetch("/api/admin/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel, productId }) }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setMsg(res?.ok ? `Đã ghi nhận: ${channel}` : j?.error ?? "Lỗi");
    setBusy("");
  }
  async function copy(s: string, what: string) {
    try {
      await navigator.clipboard.writeText(s);
      setMsg(`Đã chép ${what}`);
    } catch {
      setMsg("Trình duyệt không cho chép, hãy chọn và chép thủ công");
    }
  }

  return (
    <article className="composer">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt={`Ảnh chia sẻ: ${name}`} width={600} height={315} loading="lazy" />
      <div className="composer-body">
        <label className="sr-only" htmlFor={`cap-${productId}`}>Nội dung bài đăng</label>
        <textarea id={`cap-${productId}`} className="input" rows={7} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(text, "nội dung")}><Icon name="copy" size={14} /> Chép nội dung</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(link, "link")}><Icon name="link" size={14} /> Chép link</button>
          <a className="btn btn-ghost btn-sm" href={image} download={`san-deal-${productId}.png`}><Icon name="download" size={14} /> Tải ảnh</a>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {connected.map((c) => (
            <button key={c} type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => act(c)}>
              <Icon name="send" size={14} /> {busy === c ? "Đang đăng…" : `Đăng ${c === "facebook" ? "Trang Facebook" : "Telegram"}`}
            </button>
          ))}
          {["zalo", "tiktok", "facebook-group"].map((c) => (
            <button key={c} type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => act(c)}>
              Đã đăng {c === "zalo" ? "Zalo" : c === "tiktok" ? "TikTok" : "nhóm FB"}
            </button>
          ))}
        </div>
        {msg && <p className="form-msg save" role="status" style={{ margin: 0 }}><Icon name="check" size={14} /> {msg}</p>}
      </div>
    </article>
  );
}

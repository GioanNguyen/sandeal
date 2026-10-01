"use client";
import { useState } from "react";
import type { PostDraft } from "@/lib/fbposts";
import { Icon } from "./Icon";

/**
 * Soạn 1 bài Facebook từ các mẫu dùng được: chọn mẫu, sửa thân bài (không link) và bình luận đầu (có link),
 * chép từng phần, tải ảnh, hoặc đăng ngay lên Trang (đăng đúng nội dung đang sửa + tự bình luận đầu).
 */
export function PostComposer({ drafts, canPost, title }: { drafts: PostDraft[]; canPost: boolean; title?: string }) {
  const [i, setI] = useState(0);
  const [edits, setEdits] = useState<Record<number, { body: string; comment: string }>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [withStory, setWithStory] = useState(true);
  const d = drafts[i];
  const cur = edits[i] ?? { body: d.body, comment: d.comment };
  const set = (k: "body" | "comment", v: string) => setEdits((e) => ({ ...e, [i]: { ...cur, [k]: v } }));

  async function copy(s: string, what: string) {
    try {
      await navigator.clipboard.writeText(s);
      setMsg(`Đã chép ${what}`);
    } catch {
      setMsg("Trình duyệt không cho chép, hãy chọn và chép thủ công");
    }
  }
  async function send(channel: string) {
    setBusy(channel);
    setMsg("");
    const res = await fetch("/api/admin/social", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(channel === "facebook"
        ? { channel, withStory, draft: { body: cur.body, comment: cur.comment, image: d.image, story: d.story, productIds: d.productIds } }
        : { channel, productId: d.productIds[0] }),
    }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    setMsg(
      !res?.ok
        ? j?.error ?? "Lỗi"
        : channel !== "facebook"
          ? `Đã ghi nhận: ${channel}`
          : j?.storyError
            ? `Đã đăng bài kèm bình luận đầu, nhưng Story lỗi: ${j.storyError}`
            : j?.storyId
              ? "Đã đăng bài kèm bình luận đầu + Story"
              : "Đã đăng lên Trang Facebook kèm bình luận đầu",
    );
    setBusy("");
  }

  return (
    <article className="composer post-composer">
      {title && <h3 className="post-title">{title}</h3>}
      {drafts.length > 1 && (
        <div className="chips wrap" role="tablist" aria-label="Chọn mẫu bài">
          {drafts.map((x, k) => (
            <button key={x.kind} type="button" role="tab" aria-selected={k === i} className="chip" aria-current={k === i} onClick={() => setI(k)}>{x.label}</button>
          ))}
        </div>
      )}
      <div className="post-media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={d.image} alt="Ảnh đăng kèm" width={600} height={315} loading="lazy" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <a href={d.story} target="_blank" rel="noreferrer" className="post-story" title="Xem ảnh Story cỡ thật"><img src={d.story} alt="Ảnh Story 9:16" width={108} height={192} loading="lazy" /></a>
      </div>
      <div className="composer-body">
        <label className="field-label" htmlFor={`b-${d.kind}-${d.productIds[0]}`}>Thân bài <small className="muted">(không có link)</small></label>
        <textarea id={`b-${d.kind}-${d.productIds[0]}`} className="input" rows={9} value={cur.body} onChange={(e) => set("body", e.target.value)} />
        <label className="field-label" htmlFor={`c-${d.kind}-${d.productIds[0]}`}>Bình luận đầu <small className="muted">(link, mã giảm)</small></label>
        <textarea id={`c-${d.kind}-${d.productIds[0]}`} className="input" rows={5} value={cur.comment} onChange={(e) => set("comment", e.target.value)} />
        {/(https?:\/\/|www\.)/i.test(cur.body) && <p className="form-msg" role="alert" style={{ margin: 0 }}>Thân bài đang có link – nên chuyển link xuống bình luận đầu.</p>}
        {/https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|[^/\s.]+[:/])/i.test(cur.comment) && (
          <p className="form-msg" role="alert" style={{ margin: 0 }}>
            Link đang là địa chỉ máy nội bộ (localhost) – Facebook không cho bấm và người khác không mở được. Hãy soạn bài trên web thật (tên miền của bạn), hoặc đặt <code>SITE_URL</code> đúng tên miền.
          </p>
        )}
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(cur.body, "thân bài")}><Icon name="copy" size={14} /> Chép thân bài</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(cur.comment, "bình luận đầu")}><Icon name="copy" size={14} /> Chép bình luận đầu</button>
          <a className="btn btn-ghost btn-sm" href={d.image} download={`san-deal-${d.kind}-${d.productIds[0]}.png`}><Icon name="download" size={14} /> Tải ảnh</a>
          <a className="btn btn-ghost btn-sm" href={d.story} download={`san-deal-story-${d.kind}-${d.productIds[0]}.png`}><Icon name="download" size={14} /> Tải ảnh Story</a>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {canPost && (
            <label className="row" style={{ gap: 6, alignItems: "center", fontSize: 14 }}>
              <input type="checkbox" checked={withStory} onChange={(e) => setWithStory(e.target.checked)} /> Đăng kèm Story
            </label>
          )}
          {canPost && (
            <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => send("facebook")}>
              <Icon name="send" size={14} /> {busy === "facebook" ? "Đang đăng…" : "Đăng Trang Facebook"}
            </button>
          )}
          {["facebook-group", "zalo", "tiktok"].map((c) => (
            <button key={c} type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => send(c)}>
              Đã đăng {c === "zalo" ? "Zalo" : c === "tiktok" ? "TikTok" : "nhóm FB"}
            </button>
          ))}
        </div>
        {msg && <p className="form-msg save" role="status" style={{ margin: 0 }}><Icon name="check" size={14} /> {msg}</p>}
      </div>
    </article>
  );
}

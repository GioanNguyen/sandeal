"use client";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";

/** Chia sẻ sản phẩm: menu chia sẻ của máy (Zalo, Messenger… trên điện thoại), Facebook, chép link */
export function ShareButtons({ url, title }: { url: string; title: string }) {
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== "undefined" && !!navigator.share), []);
  const shareLink = `${url}${url.includes("?") ? "&" : "?"}utm_source=share&utm_medium=social`;

  return (
    <div className="share" role="group" aria-label="Chia sẻ">
      <span className="muted">Chia sẻ:</span>
      {canShare && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigator.share({ title, text: title, url: shareLink }).catch(() => {})}>
          <Icon name="send" size={14} /> Gửi cho bạn bè
        </button>
      )}
      <a className="btn btn-ghost btn-sm" target="_blank" rel="noopener" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareLink)}`}>
        Facebook
      </a>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(shareLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          } catch {}
        }}
      >
        <Icon name={copied ? "check" : "link"} size={14} /> {copied ? "Đã chép link" : "Chép link"}
      </button>
    </div>
  );
}

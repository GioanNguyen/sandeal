"use client";
import { useEffect, useRef, useState } from "react";
import { thumbUrl } from "@/lib/images";

/**
 * Ảnh thẻ deal: nền "shimmer" giữ chỗ trong lúc tải, hiện dần khi tải xong.
 * Có ảnh phụ (`hover`) thì rê chuột lên thẻ sẽ chuyển sang ảnh thứ 2 (chỉ tải khi rê chuột lần đầu).
 */
export function CardImage({ src: original, alt = "", hover, priority = false }: { src: string | null; alt?: string; hover?: string | null; priority?: boolean }) {
  // Bản thu nhỏ cho màn hình thường, bản lớn cho màn hình nét (retina)
  // Bản thu nhỏ lỗi (sàn đổi cách đặt tên) -> dùng lại ảnh gốc
  const [plain, setPlain] = useState(false);
  const src = plain ? original : thumbUrl(original, 300);
  const src2x = plain ? original : thumbUrl(original, 600);
  const [state, setState] = useState<"loading" | "done" | "error">(original ? "loading" : "error");
  const [alt2, setAlt2] = useState<"off" | "loading" | "done">("off");
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const card = box.current?.closest(".deal");
    if (!hover || !card || !matchMedia("(hover: hover)").matches) return;
    const arm = () => setAlt2((s) => (s === "off" ? "loading" : s));
    card.addEventListener("pointerenter", arm, { once: true });
    return () => card.removeEventListener("pointerenter", arm);
  }, [hover]);
  return (
    <span ref={box} className={`card-img ${state}${priority ? " prio" : ""}${alt2 === "done" && state === "done" ? " has-alt" : ""}`}>
      {src && state !== "error" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          srcSet={src2x && src2x !== src ? `${src} 1x, ${src2x} 2x` : undefined}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          width={400}
          height={400}
          ref={(el) => { if (el?.complete && el.naturalWidth) setState("done"); }}
          onLoad={() => setState("done")}
          onError={() => (!plain && src !== original ? setPlain(true) : setState("error"))}
        />
      )}
      {hover && alt2 !== "off" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="alt-img" src={thumbUrl(hover, 600) ?? hover} alt="" aria-hidden="true" decoding="async" width={400} height={400} onLoad={() => setAlt2("done")} onError={() => setAlt2("off")} />
      )}
    </span>
  );
}

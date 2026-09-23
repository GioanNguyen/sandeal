"use client";
import { useState } from "react";

/** Ảnh thẻ deal: nền "shimmer" giữ chỗ trong lúc tải, hiện dần khi tải xong */
export function CardImage({ src, alt = "" }: { src: string | null; alt?: string }) {
  const [state, setState] = useState<"loading" | "done" | "error">(src ? "loading" : "error");
  return (
    <span className={`card-img ${state}`}>
      {src && state !== "error" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          width={400}
          height={400}
          ref={(el) => { if (el?.complete && el.naturalWidth) setState("done"); }}
          onLoad={() => setState("done")}
          onError={() => setState("error")}
        />
      )}
    </span>
  );
}

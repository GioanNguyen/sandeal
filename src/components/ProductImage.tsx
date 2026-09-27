"use client";
import { useState } from "react";
import { thumbUrl } from "@/lib/images";

/**
 * Ảnh chính trang sản phẩm (thường là phần tử lớn nhất – LCP): tải sớm, ưu tiên cao,
 * dùng bản 600px của sàn cho màn hình thường và ảnh gốc cho màn hình nét; bản thu nhỏ lỗi thì dùng ảnh gốc.
 */
export function ProductImage({ src, alt }: { src: string | null; alt: string }) {
  const [plain, setPlain] = useState(false);
  if (!src) return null;
  const small = plain ? src : thumbUrl(src, 600) ?? src;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={small}
      srcSet={small !== src ? `${small} 600w, ${src} 1200w` : undefined}
      sizes="(max-width: 860px) 100vw, 420px"
      alt={alt}
      width={600}
      height={600}
      fetchPriority="high"
      decoding="async"
      onError={() => !plain && small !== src && setPlain(true)}
    />
  );
}

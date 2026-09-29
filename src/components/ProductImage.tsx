"use client";
import { useState } from "react";
import { thumbUrl } from "@/lib/images";

/**
 * Ảnh trang sản phẩm (ảnh chính thường là phần tử lớn nhất – LCP): tải sớm, ưu tiên cao,
 * dùng bản 600px của sàn cho màn hình thường và ảnh gốc cho màn hình nét; bản thu nhỏ lỗi thì dùng ảnh gốc.
 * Có ảnh phụ thì hiện hàng ảnh nhỏ bên dưới, bấm để đổi ảnh lớn.
 */
export function ProductImage({ src, images = [], alt }: { src: string | null; images?: string[] | null; alt: string }) {
  const list = [src, ...(images ?? [])].filter((u, i, a): u is string => !!u && u.startsWith("http") && a.indexOf(u) === i).slice(0, 5);
  const [active, setActive] = useState(0);
  const [plain, setPlain] = useState<Record<string, boolean>>({});
  if (!list.length) return null;
  const cur = list[Math.min(active, list.length - 1)];
  const small = plain[cur] ? cur : thumbUrl(cur, 600) ?? cur;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={cur}
        src={small}
        srcSet={small !== cur ? `${small} 600w, ${cur} 1200w` : undefined}
        sizes="(max-width: 860px) 100vw, 420px"
        alt={alt}
        width={600}
        height={600}
        fetchPriority={active === 0 ? "high" : "auto"}
        decoding="async"
        onError={() => !plain[cur] && small !== cur && setPlain((s) => ({ ...s, [cur]: true }))}
      />
      {list.length > 1 && (
        <div className="detail-thumbs" role="list" aria-label="Ảnh sản phẩm">
          {list.map((u, i) => (
            <button key={u} type="button" role="listitem" className={i === active ? "on" : ""} aria-label={`Ảnh ${i + 1}`} aria-pressed={i === active} onClick={() => setActive(i)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbUrl(u, 300) ?? u} alt="" width={64} height={64} loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
      )}
    </>
  );
}

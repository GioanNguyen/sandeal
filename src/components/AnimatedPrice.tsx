"use client";
import { useEffect, useRef, useState } from "react";
import { vnd } from "@/lib/format";

/**
 * Giá "chạy" từ giá thường ngày xuống giá hiện tại (~0,6 giây) khi thẻ vừa cuộn vào màn hình.
 * Thẻ đã nằm sẵn trên màn hình lúc tải trang thì hiện ngay giá cuối (không nháy số).
 * Tắt hiệu ứng nếu máy bật giảm chuyển động.
 */
export function AnimatedPrice({ value, from }: { value: number; from: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const el = ref.current;
    if (!el || from <= value || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let first = true;
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (first) {
        first = false;
        if (e.isIntersecting) { io.disconnect(); return; } // đã thấy sẵn -> không chạy số
        return;
      }
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / 600);
        const ease = 1 - Math.pow(1 - k, 3);
        setShown(Math.round((from - (from - value) * ease) / 1000) * 1000);
        if (k < 1) raf = requestAnimationFrame(step);
        else setShown(value);
      };
      setShown(from);
      raf = requestAnimationFrame(step);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [value, from]);
  return <span ref={ref} aria-label={vnd(value)}><span aria-hidden="true">{vnd(shown)}</span></span>;
}

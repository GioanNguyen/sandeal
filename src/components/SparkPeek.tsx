"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Bọc biểu đồ giá nhỏ trên thẻ: rê chuột (máy tính) hoặc nhấn giữ (điện thoại) để xem biểu đồ lớn có mốc giá.
 * Nhấn giữ không mở trang sản phẩm; chạm chỗ khác để đóng.
 */
export function SparkPeek({ children, detail }: { children: ReactNode; detail: ReactNode }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const t = setTimeout(() => setOpen(false), 6000);
    document.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close as EventListener, { passive: true });
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close as EventListener);
    };
  }, [open]);

  const cancel = () => clearTimeout(timer.current);

  return (
    <div
      ref={box}
      className={`spark-peek${open ? " open" : ""}`}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse") return;
        cancel();
        timer.current = setTimeout(() => {
          setOpen(true);
          navigator.vibrate?.(10);
          // Chặn cú "click" sinh ra khi nhả tay để không mở trang sản phẩm (chặn ở window, trước mọi listener khác)
          const block = (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); };
          window.addEventListener("click", block, { capture: true, once: true });
          setTimeout(() => window.removeEventListener("click", block, { capture: true }), 800);
        }, 420);
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
      <div className="spark-pop" role="tooltip">{detail}</div>
    </div>
  );
}

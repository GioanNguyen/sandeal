"use client";
import { useState } from "react";
import { Icon } from "./Icon";

/**
 * Tạo ảnh vuông có giá + biểu đồ rồi chia sẻ thẳng (điện thoại: Zalo, Messenger… qua bảng chia sẻ của máy),
 * máy không hỗ trợ chia sẻ file thì tải ảnh về.
 */
export function ShareImageButton({ id, url, title }: { id: number; url: string; title: string }) {
  const [state, setState] = useState<"idle" | "busy" | "saved" | "error">("idle");
  const run = async () => {
    setState("busy");
    try {
      const res = await fetch(`/api/share-image/${id}`);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const file = new File([blob], `san-deal-${id}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title, text: `${title}\n${url}` }).catch((e) => {
          if ((e as Error).name !== "AbortError") throw e;
        });
        setState("idle");
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        setState("saved");
      }
    } catch {
      setState("error");
    }
  };
  return (
    <button type="button" className="btn btn-ghost btn-sm share-img-btn" onClick={run} disabled={state === "busy"} aria-live="polite">
      <Icon name="download" size={15} />
      {state === "busy" ? "Đang tạo ảnh…" : state === "saved" ? "Đã tải ảnh – đăng kèm link nhé" : state === "error" ? "Lỗi, thử lại" : "Chia sẻ ảnh giá"}
    </button>
  );
}

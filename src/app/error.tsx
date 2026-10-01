"use client";
import { useEffect } from "react";
import { reloadOnceForChunkError, reportClientError } from "@/lib/reload-once";

/** Lỗi khi hiển thị 1 trang: báo nhẹ nhàng thay cho màn hình "Application error" trắng */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    if (!reloadOnceForChunkError(error)) reportClientError(error);
  }, [error]);
  return (
    <div className="empty" style={{ margin: "48px auto", maxWidth: 520 }}>
      <h1 className="page-title" style={{ fontSize: 22 }}>Trang chưa tải được</h1>
      <p className="muted">Có thể web vừa cập nhật hoặc mạng chập chờn. Bấm tải lại để thử lần nữa.</p>
      <div className="row" style={{ gap: 8, justifyContent: "center" }}>
        <button type="button" className="btn btn-primary" onClick={() => location.reload()}>Tải lại trang</button>
        <button type="button" className="btn btn-ghost" onClick={() => reset()}>Thử lại</button>
        <a className="btn btn-ghost" href="/">Về trang chủ</a>
      </div>
    </div>
  );
}

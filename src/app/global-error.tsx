"use client";
import { useEffect } from "react";
import { reloadOnceForChunkError, reportClientError } from "@/lib/reload-once";

/** Lỗi ở khung trang (layout): trang tối giản, không phụ thuộc CSS của web */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
    if (!reloadOnceForChunkError(error)) reportClientError(error);
  }, [error]);
  return (
    <html lang="vi">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#fff7f2", color: "#1c1a19", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, padding: 16, textAlign: "center" }}>
        <div>
          <h1 style={{ fontSize: 22 }}>Trang chưa tải được</h1>
          <p style={{ color: "#5b6170" }}>Có thể web vừa cập nhật hoặc mạng chập chờn.</p>
          <button type="button" onClick={() => location.reload()} style={{ background: "#d0390f", color: "#fff", border: 0, borderRadius: 999, padding: "12px 22px", fontSize: 16, fontWeight: 700 }}>Tải lại trang</button>
          <p><a href="/" style={{ color: "#d0390f" }}>Về trang chủ Săn Deal</a></p>
        </div>
      </body>
    </html>
  );
}

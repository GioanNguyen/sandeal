/** Khung chờ hiển thị ngay khi chuyển trang, trong lúc máy chủ chuẩn bị dữ liệu */
export function SkeletonGrid({ count = 10 }: { count?: number }) {
  return (
    <div className="grid" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="sk-card">
          <div className="sk sk-img" />
          <div className="sk-body">
            <div className="sk sk-line" />
            <div className="sk sk-line short" />
            <div className="sk sk-price" />
            <div className="sk sk-line" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LoadingNote({ text = "Đang tải…" }: { text?: string }) {
  return (
    <p className="loading-note" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" /> {text}
    </p>
  );
}

import { LoadingNote } from "@/components/Skeletons";

export default function Loading() {
  return (
    <div className="page-loading">
      <div className="sk sk-title" />
      <LoadingNote text="Đang tải mã giảm giá…" />
      <div className="tickets" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="sk" style={{ height: 132, borderRadius: 14 }} />)}
      </div>
    </div>
  );
}

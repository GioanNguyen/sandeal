import { LoadingNote } from "@/components/Skeletons";

export default function Loading() {
  return (
    <div className="page-loading">
      <div className="sk sk-line short" style={{ width: 260, marginTop: 20 }} />
      <div className="detail" style={{ marginTop: 12 }} aria-hidden="true">
        <div className="sk" style={{ aspectRatio: "1", borderRadius: 20 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="sk sk-title" style={{ width: "80%" }} />
          <div className="sk sk-price" style={{ height: 40, width: 220 }} />
          <div className="sk" style={{ height: 70, borderRadius: 14 }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
            <div className="sk" style={{ height: 64, borderRadius: 14 }} />
            <div className="sk" style={{ height: 64, borderRadius: 14 }} />
            <div className="sk" style={{ height: 64, borderRadius: 14 }} />
          </div>
          <div className="sk" style={{ height: 220, borderRadius: 14 }} />
        </div>
      </div>
      <LoadingNote text="Đang tải lịch sử giá…" />
    </div>
  );
}

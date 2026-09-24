import { LoadingNote } from "@/components/Skeletons";

/** Khung chờ chung cho các trang không có khung chờ riêng */
export default function Loading() {
  return (
    <div className="page-loading" style={{ maxWidth: 720 }}>
      <div className="sk sk-title" />
      <div className="sk sk-line" style={{ marginBottom: 10 }} />
      <div className="sk sk-line short" style={{ marginBottom: 24 }} />
      <div className="sk" style={{ height: 180, borderRadius: 14 }} aria-hidden="true" />
      <LoadingNote />
    </div>
  );
}

import { LoadingNote, SkeletonGrid } from "@/components/Skeletons";

/** Hiện ngay khi chuyển tới trang danh sách deal (trang chủ, lọc, tìm kiếm…) */
export default function Loading() {
  return (
    <div className="page-loading">
      <div className="sk sk-title" />
      <LoadingNote text="Đang tìm deal cho bạn…" />
      <SkeletonGrid count={10} />
    </div>
  );
}

import { LoadingNote, SkeletonGrid } from "@/components/Skeletons";

export default function Loading() {
  return (
    <div className="page-loading">
      <div className="sk sk-title" />
      <LoadingNote text="Đang tìm deal…" />
      <SkeletonGrid count={10} />
    </div>
  );
}

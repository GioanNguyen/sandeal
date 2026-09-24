import type { Metadata } from "next";
import { SavedList } from "@/components/SavedList";

export const metadata: Metadata = { title: "Đã lưu", robots: { index: false } };

export default function SavedPage() {
  return (
    <>
      <h1 className="page-title">Đã lưu</h1>
      <p className="page-sub">Các món bạn bấm ♡. Món nào giảm giá kể từ lần trước bạn ghé sẽ được đưa lên đầu.</p>
      <SavedList />
    </>
  );
}

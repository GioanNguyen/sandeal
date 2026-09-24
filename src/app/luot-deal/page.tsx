import type { Metadata } from "next";
import { SwipeDeck } from "@/components/SwipeDeck";

export const metadata: Metadata = {
  title: "Lướt deal",
  description: "Lướt nhanh deal giảm thật: vuốt phải để lưu, vuốt trái để bỏ qua.",
};

export default function SwipePage() {
  return (
    <>
      <h1 className="page-title">Lướt deal</h1>
      <p className="page-sub">Lướt nhanh từng deal giảm thật. Món bạn lưu giúp mục “Dành cho bạn” gợi ý đúng gu hơn.</p>
      <SwipeDeck />
    </>
  );
}

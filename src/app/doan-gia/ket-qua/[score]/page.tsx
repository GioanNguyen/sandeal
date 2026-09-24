import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";

type P = { params: Promise<{ score: string }> };
const clamp = (s: string) => Math.max(0, Math.min(5, Number.parseInt(s, 10) || 0));

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const s = clamp((await params).score);
  return {
    title: `Đoán đúng ${s}/5 giá deal – bạn được mấy điểm?`,
    description: "Mini game Đoán giá của Săn Deal: 5 câu mỗi ngày, mọi người cùng đề.",
    robots: { index: false },
  };
}

/** Trang đích khi bạn bè bấm link khoe điểm: mời chơi đề hôm nay */
export default async function SharedScore({ params }: P) {
  const s = clamp((await params).score);
  return (
    <div className="guess-invite">
      <span className="guess-invite-score">{s}/5</span>
      <h1>Bạn của bạn đoán đúng {s}/5 giá deal hôm nay</h1>
      <p className="page-sub">5 món đang giảm thật trên Shopee, Lazada, TikTok Shop. Biết giá thường ngày, bạn có đoán ra giá sale?</p>
      <Link href="/doan-gia" className="btn btn-primary"><Icon name="sparkles" size={16} /> Chơi ngay, không cần đăng nhập</Link>
    </div>
  );
}

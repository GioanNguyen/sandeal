import type { Metadata } from "next";
import { GuessGame } from "@/components/GuessGame";
import { siteUrl } from "@/lib/mail";
import { guessRounds } from "@/lib/play";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Đoán giá deal hôm nay",
  description: "5 câu mỗi ngày: biết giá thường ngày, đoán giá sale thật trên Shopee, Lazada, TikTok Shop. Rủ bạn bè so điểm!",
  alternates: { canonical: "/doan-gia" },
};

export default async function GuessPage() {
  const { day, rounds } = await guessRounds();
  return (
    <>
      <h1 className="page-title">Đoán giá deal hôm nay</h1>
      <p className="page-sub">5 món đang giảm thật. Biết giá thường ngày, bạn đoán được giá sale không? Mọi người cùng một đề, đổi mới mỗi ngày.</p>
      <GuessGame day={day} rounds={rounds} siteUrl={siteUrl()} />
    </>
  );
}

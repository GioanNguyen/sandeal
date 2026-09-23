import type { Metadata } from "next";
import { CollectionCards } from "@/components/CollectionCards";
import Link from "next/link";
import { COLLECTIONS, isInSeason } from "@/lib/collections";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Bộ sưu tập deal theo chủ đề – quà tặng, công nghệ, làm đẹp",
  description: "Deal giảm thật gom theo chủ đề: quà 20/10, chuẩn bị 11.11, đồ công nghệ dưới 500K, làm đẹp dưới 200K…",
  alternates: { canonical: "/bo-suu-tap" },
};

export default function Collections() {
  const upcoming = COLLECTIONS.filter((c) => !isInSeason(c));
  return (
    <>
      <h1 className="page-title">Bộ sưu tập deal</h1>
      <p className="page-sub">Deal giảm thật gom theo chủ đề, cập nhật liên tục theo giá mới nhất.</p>
      <CollectionCards limit={20} />
      {upcoming.length > 0 && (
        <p className="muted" style={{ fontSize: 14 }}>
          Sắp mở: {upcoming.map((c, i) => <span key={c.slug}>{i ? ", " : ""}<Link href={`/bo-suu-tap/${c.slug}`}>{c.title}</Link></span>)}
        </p>
      )}
    </>
  );
}

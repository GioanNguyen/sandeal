import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { DealGrid } from "@/components/DealGrid";
import { Icon } from "@/components/Icon";
import { SaveAllButton } from "@/components/ShareList";
import { ShareButtons } from "@/components/ShareButtons";
import { vnd } from "@/lib/format";
import { siteUrl } from "@/lib/mail";
import { getList } from "@/lib/play";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const l = await getList((await params).slug);
  if (!l) return { title: "Không tìm thấy danh sách" };
  return { title: `${l.title} – ${l.items.length} deal`, description: `Danh sách ${l.items.length} deal giảm thật trên Shopee, Lazada, TikTok Shop, giá cập nhật liên tục.`, robots: { index: false } };
}

export default async function SharedListPage({ params }: P) {
  const l = await getList((await params).slug, true);
  if (!l) notFound();
  const saving = l.items.reduce((s, x) => s + (x.realDropPct >= 1 ? x.price / (1 - x.realDropPct / 100) - x.price : 0), 0);
  const created = new Intl.DateTimeFormat("vi-VN", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(l.createdAt);
  return (
    <>
      <p className="list-eyebrow"><Icon name="heart" size={14} /> Danh sách deal chia sẻ · tạo ngày {created}</p>
      <h1 className="page-title">{l.title}</h1>
      <p className="page-sub">
        {l.items.length} món · giá bên dưới là giá <b>hiện tại</b>, cập nhật liên tục
        {saving >= 1000 && <> · đang rẻ hơn giá thường ngày tổng <b className="save">{vnd(Math.round(saving / 1000) * 1000)}</b></>}
      </p>
      <div className="list-actions">
        <SaveAllButton items={l.items.map((x) => ({ id: x.id, name: x.name, price: x.price }))} />
        <ShareButtons url={`${siteUrl()}/ds/${l.slug}`} title={`${l.title} – ${l.items.length} deal giảm thật`} />
      </div>
      {l.items.length ? <DealGrid items={l.items} /> : <div className="empty">Các sản phẩm trong danh sách này không còn bán.</div>}
      <p className="muted" style={{ marginTop: 24, textAlign: "center" }}>
        Muốn tự gom danh sách? Bấm ♡ để lưu món, rồi vào <Link href="/da-luu">Đã lưu</Link> → “Chia sẻ danh sách”.
      </p>
    </>
  );
}

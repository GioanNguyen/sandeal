import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { DayDropList } from "@/components/DayDropList";
import { Icon } from "@/components/Icon";
import { ARCHIVE_DAYS, dayDrops, daySlug, parseDay } from "@/lib/daily";
import { DAY, vnDateLabel, vnDayStart } from "@/lib/pricehist";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ day: string }> };

function resolve(slug: string) {
  const t = parseDay(slug);
  const today = vnDayStart(Date.now());
  if (t == null || t > today || t < today - ARCHIVE_DAYS * DAY) return null;
  return { t, today: t === today };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const d = resolve((await params).day);
  if (!d || d.today) return {};
  const n = (await dayDrops(d.t)).length;
  const label = vnDateLabel(d.t);
  const title = `Deal ngày ${label}: ${n} món giảm giá thật`;
  return {
    title,
    description: `Những món giảm giá ngày ${label} và rẻ hơn giá thường ngày 30 ngày – kèm giá hiện tại để so sánh.`,
    alternates: { canonical: `/deal-hom-nay/${daySlug(d.t)}` },
    // Ngày ít deal: trang mỏng, không cho Google index
    robots: n < 3 ? { index: false, follow: true } : undefined,
  };
}

export default async function DealDay({ params }: Props) {
  const d = resolve((await params).day);
  if (!d) notFound();
  if (d.today) redirect("/deal-hom-nay");
  const drops = await dayDrops(d.t);
  const label = vnDateLabel(d.t);
  const prev = d.t - DAY, next = d.t + DAY;
  const today = vnDayStart(Date.now());
  return (
    <>
      <Breadcrumbs items={[{ name: "Deal hôm nay", href: "/deal-hom-nay" }, { name: label }]} />
      <header className="roundup-head">
        <span className="roundup-week"><Icon name="calendar" size={14} /> Lưu trữ ngày {label}</span>
        <h1 className="page-title">Deal ngày {label}</h1>
        <p className="page-sub">
          {drops.length} món giảm giá trong ngày này và rẻ hơn giá thường ngày 30 ngày ít nhất 10%. Giá bên phải là giá lúc đó; dòng nhỏ là giá hiện tại – deal có thể đã hết.
        </p>
      </header>
      {drops.length ? <DayDropList items={drops} today={false} /> : <p className="muted">Ngày này không có món nào giảm thật từ 10%.</p>}
      <nav className="week-nav" aria-label="Ngày khác">
        {prev >= today - ARCHIVE_DAYS * DAY ? <Link className="btn btn-ghost btn-sm" href={`/deal-hom-nay/${daySlug(prev)}`}>← {vnDateLabel(prev).slice(0, 5)}</Link> : <span />}
        <Link className="btn btn-ghost btn-sm" href={next >= today ? "/deal-hom-nay" : `/deal-hom-nay/${daySlug(next)}`}>{next >= today ? "Hôm nay" : vnDateLabel(next).slice(0, 5)} →</Link>
      </nav>
    </>
  );
}

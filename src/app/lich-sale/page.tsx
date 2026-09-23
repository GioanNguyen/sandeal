import type { Metadata } from "next";
import Link from "next/link";
import { and, gte, isNull, lte, or } from "drizzle-orm";
import { vouchers } from "@/db/schema";
import { db, ensureMigrated } from "@/lib/db";
import { FLASH_SLOTS, nextSale, upcomingSales } from "@/lib/sales";
import { Countdown } from "@/components/Countdown";
import { Icon } from "@/components/Icon";
import { VoucherTicket } from "@/components/VoucherTicket";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Lịch sale Shopee, Lazada, TikTok Shop – đếm ngược 10.10, 11.11, 12.12",
  description: "Lịch các đợt sale lớn: ngày đôi, ngày lương, Black Friday. Đếm ngược, khung giờ flash sale và mã giảm giá cho từng đợt.",
  alternates: { canonical: "/lich-sale" },
};

const dateLabel = (d: Date) =>
  d.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" });

export default async function SaleCalendar() {
  await ensureMigrated();
  const now = new Date();
  const events = upcomingSales(now, 9);
  const major = nextSale(now, true);
  const majorVouchers = await db
    .select()
    .from(vouchers)
    .where(
      and(
        or(isNull(vouchers.startAt), lte(vouchers.startAt, major.end)),
        or(isNull(vouchers.endAt), gte(vouchers.endAt, major.start)),
        or(isNull(vouchers.endAt), gte(vouchers.endAt, now)),
      ),
    )
    .limit(6);

  return (
    <>
      <section className="sale-hero">
        <div>
          <span className="hero-eyebrow"><Icon name="calendar" size={14} /> Đợt sale lớn tiếp theo</span>
          <h1>{major.name}</h1>
          <p>{dateLabel(major.start)} · {major.note}</p>
        </div>
        <Countdown to={major.start.toISOString()} until={major.end.toISOString()} />
        <div className="hero-actions">
          <Link href="/account/so-thich" className="btn btn-light"><Icon name="bell" size={16} /> Nhắc tôi tối hôm trước</Link>
          <Link href="/kiem-tra-gia" className="btn btn-outline"><Icon name="link" size={16} /> Kiểm tra giá trước ngày sale</Link>
        </div>
      </section>

      <div className="sale-grid">
        <section className="panel">
          <h2><Icon name="calendar" /> Các đợt sale sắp tới</h2>
          <ul className="sale-list">
            {events.map((e) => (
              <li key={e.key} className={`sale-item sale-${e.kind}`}>
                <div className="sale-date">
                  <b>{e.start.toLocaleDateString("vi-VN", { day: "2-digit", timeZone: "Asia/Ho_Chi_Minh" })}</b>
                  <span>Th {e.start.toLocaleDateString("vi-VN", { month: "numeric", timeZone: "Asia/Ho_Chi_Minh" })}</span>
                </div>
                <div className="sale-info">
                  <b>{e.name}</b>
                  <span className="muted">{e.note}</span>
                </div>
                <Countdown to={e.start.toISOString()} until={e.end.toISOString()} compact />
              </li>
            ))}
          </ul>
        </section>

        <div>
          <section className="panel">
            <h2><Icon name="clock" /> Khung giờ vàng flash sale</h2>
            <p className="muted" style={{ margin: "0 0 12px", fontSize: 14 }}>Các khung giờ thường mở flash sale trong ngày sale lớn. Có thể thay đổi theo sàn và từng đợt.</p>
            <div className="slots">{FLASH_SLOTS.map((s) => <span key={s} className="slot">{s}</span>)}</div>
          </section>
          <section className="panel">
            <h2><Icon name="shield" /> Mẹo săn sale không bị hớ</h2>
            <ol className="tips">
              <li><b>Kiểm tra giá thật trước 3–7 ngày.</b> Nhiều shop tăng giá ngay trước sale rồi “giảm” về giá cũ. Dán link vào <Link href="/kiem-tra-gia">Kiểm tra giá</Link> để xem lịch sử.</li>
              <li><b>Lưu mã và bỏ sẵn vào giỏ</b> từ tối hôm trước, mã lớn thường hết trong vài phút đầu.</li>
              <li><b>Đặt báo giá</b> cho món muốn mua, bạn sẽ nhận email khi giá chạm mức mong muốn.</li>
            </ol>
          </section>
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2><Icon name="ticket" size={22} /> Mã dùng được trong {major.name}</h2>
          <Link href="/vouchers">Tất cả mã <Icon name="arrowRight" size={16} /></Link>
        </div>
        {majorVouchers.length ? (
          <div className="tickets">{majorVouchers.map((v) => <VoucherTicket key={v.id} v={v} now={now} />)}</div>
        ) : (
          <div className="empty">Chưa có mã cho đợt này. Mã thường được mở 1–3 ngày trước ngày sale, hãy quay lại sau nhé.</div>
        )}
      </section>
    </>
  );
}

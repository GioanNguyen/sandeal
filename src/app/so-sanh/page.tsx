import type { Metadata } from "next";
import Link from "next/link";
import { PLATFORMS, vnd } from "@/lib/format";
import { biggestGaps } from "@/lib/queries";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "So sánh giá Shopee, Lazada, TikTok Shop – cùng sản phẩm, chênh giá nhất",
  description: "Những sản phẩm có giá chênh lệch nhiều nhất giữa các sàn. Mua ở sàn rẻ nhất, tiết kiệm ngay.",
  alternates: { canonical: "/so-sanh" },
};

export default async function ComparePage() {
  const groups = await biggestGaps(24);
  return (
    <>
      <h1 className="page-title">So sánh giá giữa các sàn</h1>
      <p className="page-sub">Cùng một sản phẩm nhưng giá khác nhau tuỳ sàn. Đây là những món chênh lệch nhiều nhất hôm nay.</p>
      {groups.length === 0 ? (
        <div className="empty">Chưa tìm thấy sản phẩm trùng nhau giữa các sàn. Danh sách sẽ có sau khi đồng bộ dữ liệu từ nhiều sàn.</div>
      ) : (
        <ul className="gap-list">
          {groups.map((g) => {
            const cheapest = g.offers[0];
            return (
              <li key={g.key} className="gap-item">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.image ?? ""} alt="" width={72} height={72} />
                <div className="gap-main">
                  <Link href={`/product/${cheapest.id}`} className="watch-name">{g.name}</Link>
                  <div className="gap-offers">
                    {g.offers.map((o, i) => (
                      <a key={o.id} href={`/product/${o.id}`} className={`gap-offer${i === 0 ? " best" : ""}`}>
                        <span className="dot" style={{ background: PLATFORMS[o.platform]?.color }} aria-hidden="true" />
                        {PLATFORMS[o.platform]?.label} <b>{vnd(o.price)}</b>
                      </a>
                    ))}
                  </div>
                </div>
                <div className="gap-save">
                  <span className="muted">Tiết kiệm tới</span>
                  <b className="save">{vnd(g.save)}</b>
                  <span className="real-drop"><Icon name="scale" size={13} /> {Math.round(g.savePct)}%</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

import { prisma } from "@/lib/db";
import { PLATFORMS, shortDate, vnd } from "@/lib/format";
import { PlatformBadge } from "@/components/PlatformBadge";
import { CopyCode } from "@/components/CopyCode";

export const dynamic = "force-dynamic";

export default async function Vouchers({ searchParams }: { searchParams: Promise<{ platform?: string }> }) {
  const { platform } = await searchParams;
  const now = new Date();
  const vouchers = await prisma.voucher.findMany({
    where: {
      ...(platform ? { platform } : {}),
      OR: [{ endAt: null }, { endAt: { gte: now } }],
    },
    orderBy: [{ endAt: "asc" }],
  });

  return (
    <>
      <h1>Mã giảm giá & khuyến mãi</h1>
      <p className="sub">Chỉ hiện mã còn hạn, sắp hết hạn xếp trước.</p>
      <form className="filters">
        <select name="platform" defaultValue={platform ?? ""}>
          <option value="">Tất cả sàn</option>
          {Object.entries(PLATFORMS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button className="primary" type="submit">Lọc</button>
      </form>
      <div className="vlist">
        {vouchers.map((v) => {
          const hoursLeft = v.endAt ? (v.endAt.getTime() - now.getTime()) / 3_600_000 : Infinity;
          return (
            <div className="voucher" key={v.id}>
              <div className="row">
                <PlatformBadge platform={v.platform} />
                {v.discountText && <b>{v.discountText}</b>}
              </div>
              <div>{v.title}</div>
              {v.minSpend ? <div className="muted">Đơn tối thiểu {vnd(v.minSpend)}</div> : null}
              <div className={hoursLeft < 24 ? "warn" : "muted"}>
                {v.endAt ? (hoursLeft < 24 ? `Hết hạn sau ${Math.max(1, Math.round(hoursLeft))} giờ` : `HSD ${shortDate(v.endAt)}`) : "Không rõ hạn"}
              </div>
              <div className="row">
                {v.code ? <CopyCode code={v.code} /> : null}
                <a className="btn" href={v.affiliateUrl} target="_blank" rel="nofollow sponsored noopener">Dùng ngay</a>
              </div>
            </div>
          );
        })}
        {vouchers.length === 0 && <p className="muted">Chưa có mã nào còn hạn.</p>}
      </div>
    </>
  );
}

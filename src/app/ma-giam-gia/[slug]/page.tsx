import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Icon } from "@/components/Icon";
import { JsonLd } from "@/components/JsonLd";
import { VoucherTicket } from "@/components/VoucherTicket";
import { vnd } from "@/lib/format";
import {
  KIND_LABEL,
  VOUCHER_PLATFORMS,
  currentMonthRef,
  monthRefs,
  monthReport,
  parseMonthSlug,
  platformLabel,
  voucherKind,
  voucherMaxValue,
  type MonthRef,
} from "@/lib/voucherpages";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

const SHORT: Record<string, (typeof VOUCHER_PLATFORMS)[number]> = { shopee: "shopee", lazada: "lazada", "tiktok-shop": "tiktok", tiktok: "tiktok" };
const monthName = (r: Pick<MonthRef, "m" | "y">) => `tháng ${r.m}/${r.y}`;
/** dd/mm theo giờ Việt Nam (không dùng toLocaleDateString: tuỳ máy chủ có thể ra "10-10") */
const dm = (d: Date) => {
  const v = new Date(d.getTime() + 7 * 3_600_000);
  return `${String(v.getUTCDate()).padStart(2, "0")}/${String(v.getUTCMonth() + 1).padStart(2, "0")}`;
};
const weekday = (d: Date) => d.toLocaleDateString("vi-VN", { weekday: "long", timeZone: "Asia/Ho_Chi_Minh" });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ref = parseMonthSlug((await params).slug);
  if (!ref) return {};
  const r = await monthReport(ref);
  const p = platformLabel(ref.platform);
  const title = `Mã giảm giá ${p} ${monthName(ref)}${ref.state === "current" ? `: ${r.list.length} mã còn hạn, lịch sale` : ref.state === "next" ? ": lịch sale và mã sắp có" : " – các mã đã phát hành"}`;
  const big = r.sales.find((e) => e.kind !== "payday");
  const description =
    ref.state === "past"
      ? `${r.list.length} mã giảm giá ${p} có hiệu lực trong ${monthName(ref)}: freeship, giảm %, giảm tiền, mức giảm và điều kiện từng mã.`
      : `Mã giảm giá ${p} ${monthName(ref)}: ${r.list.length} mã${r.byKind.find((k) => k.kind === "freeship") ? `, ${r.byKind.find((k) => k.kind === "freeship")!.n} mã freeship` : ""}${big ? `, ${big.name.replace(/ – .*/, "")} ngày ${dm(big.start)}` : ""}. Bấm chép mã, xem hạn dùng và đơn tối thiểu.`;
  return { title, description, alternates: { canonical: `/ma-giam-gia/${ref.slug}` }, openGraph: { title, description } };
}

export default async function VoucherMonthPage({ params }: Props) {
  const slug = (await params).slug;
  // /ma-giam-gia/shopee → tháng hiện tại
  if (SHORT[slug]) permanentRedirect(`/ma-giam-gia/${currentMonthRef(SHORT[slug]).slug}`);
  const ref = parseMonthSlug(slug);
  if (!ref) notFound();
  const now = new Date();
  const r = await monthReport(ref, now);
  const p = platformLabel(ref.platform);
  const updated = now.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
  const freeship = r.byKind.find((k) => k.kind === "freeship")?.n ?? 0;
  const big = r.sales.find((e) => e.kind !== "payday");
  const refs = monthRefs(now);
  const sameMonth = refs.filter((x) => x.y === ref.y && x.m === ref.m && x.platform !== ref.platform);
  const otherMonths = refs.filter((x) => x.platform === ref.platform && x.slug !== ref.slug);

  const faq = [
    {
      q: `${p} ${monthName(ref)} có những mã giảm giá nào?`,
      a: r.list.length
        ? `${ref.state === "past" ? "Trong tháng có" : "Hiện có"} ${r.list.length} mã: ${r.byKind.map((k) => `${KIND_LABEL[k.kind].toLowerCase()} ${k.n} mã`).join(", ")}${r.noMin ? `; ${r.noMin} mã không cần đơn tối thiểu` : ""}.`
        : `Săn Deal chưa thu thập được mã ${p} nào cho ${monthName(ref)}. Mã thường được sàn phát hành sát ngày sale; trang này tự cập nhật khi có mã mới.`,
    },
    ...(big
      ? [{ q: `Ngày nào trong ${monthName(ref)} ${p} sale lớn nhất?`, a: `${big.name.replace(/ – .*/, "")} ngày ${dm(big.start)} (${weekday(big.start)}): ${big.note.toLowerCase()}. Ngoài ra còn ${r.sales.filter((e) => e !== big).map((e) => `${e.name.replace(/ – .*/, "")} (${dm(e.start)})`).join(", ") || "các đợt nhỏ hơn"}.` }]
      : []),
    ...(r.strongest
      ? [{ q: `Mã ${p} nào giảm nhiều tiền nhất ${monthName(ref)}?`, a: `${r.strongest.title}${r.strongest.code ? ` (mã ${r.strongest.code})` : ""}: giảm tối đa ${vnd(voucherMaxValue(r.strongest))}${r.strongest.minSpend ? `, đơn từ ${vnd(r.strongest.minSpend)}` : ""}. Mã giảm nhiều chưa chắc có lợi nhất – hãy tính theo đơn thật của bạn bằng Máy tính giá cuối cùng.` }]
      : []),
    { q: `Có mã freeship ${p} ${monthName(ref)} không?`, a: freeship ? `Có ${freeship} mã miễn phí hoặc giảm phí vận chuyển ${ref.state === "past" ? "trong tháng" : "đang còn hạn"}. Điều kiện từng mã (đơn tối thiểu, khu vực) xem trong chi tiết mã trên ${p}.` : `Săn Deal chưa thấy mã freeship ${p} nào ${ref.state === "past" ? "trong tháng này" : "còn hạn lúc này"}.` },
  ];

  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }} />
      <Breadcrumbs items={[{ name: "Mã giảm giá theo tháng", href: "/ma-giam-gia" }, { name: `${p} ${monthName(ref)}` }]} />
      <header className="roundup-head">
        <span className="roundup-week"><Icon name="clock" size={14} /> {ref.state === "past" ? "Lưu trữ" : `Cập nhật ${updated}`}</span>
        <h1 className="page-title">Mã giảm giá {p} {monthName(ref)}</h1>
        <p className="page-sub">
          {ref.state === "current" && <>Các mã {p} còn hạn, mã sắp hết hạn xếp trước, kèm lịch sale trong tháng. Bấm vào mã để chép.</>}
          {ref.state === "next" && <>Lịch sale {p} {monthName(ref)} và các mã sàn đã phát hành sớm. Trang tự cập nhật khi có mã mới.</>}
          {ref.state === "past" && <>Các mã {p} từng có hiệu lực trong {monthName(ref)} – để tham khảo mức giảm và điều kiện thường gặp. Mã đã hết hạn, không dùng được nữa.</>}
        </p>
      </header>

      <div className="pt-stats">
        <div><span>{ref.state === "past" ? "Mã trong tháng" : "Mã còn hạn"}</span><b>{r.list.length}</b></div>
        <div><span>Freeship</span><b>{freeship}</b></div>
        <div><span>Không cần đơn tối thiểu</span><b>{r.noMin}</b></div>
        {r.strongest ? <div className="good"><span>Giảm nhiều nhất</span><b>{vnd(voucherMaxValue(r.strongest))}</b></div> : null}
      </div>

      {r.sales.length > 0 && (
        <section className="section" aria-labelledby="cal-head">
          <div className="section-head"><h2 id="cal-head"><Icon name="calendar" size={20} /> Lịch sale {p} {monthName(ref)}</h2><Link href="/lich-sale">Lịch sale <Icon name="arrowRight" size={16} /></Link></div>
          <ul className="vm-cal">
            {r.sales.map((e) => {
              const state = e.end < now ? "done" : e.start <= now ? "live" : "soon";
              return (
                <li key={e.key} className={`vm-day ${state}${e.kind !== "payday" ? " big" : ""}`}>
                  <b>{dm(e.start)}</b>
                  <span className="vm-name">{e.name.replace(/ – .*/, "")}</span>
                  <span className="muted">{state === "done" ? "Đã qua" : state === "live" ? "Đang diễn ra" : `${weekday(e.start)}`}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="section" aria-labelledby="list-head">
        <div className="section-head"><h2 id="list-head"><Icon name="ticket" size={20} /> {ref.state === "past" ? `Mã ${p} trong ${monthName(ref)}` : `Mã ${p} đang có`}</h2></div>
        {r.list.length === 0 ? (
          <div className="empty">
            {ref.state === "next" ? `${p} chưa phát hành mã cho ${monthName(ref)}. Mã thường xuất hiện vài ngày trước mỗi đợt sale.` : `Chưa có mã ${p} nào ${ref.state === "past" ? "được lưu cho tháng này" : "còn hạn"}.`}{" "}
            <Link href="/vouchers">Xem mã của các sàn khác</Link>
          </div>
        ) : ref.state === "past" ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th scope="col">Mã</th><th scope="col">Loại</th><th scope="col" className="num">Đơn tối thiểu</th><th scope="col" className="num">Hiệu lực</th></tr></thead>
              <tbody>
                {r.list.slice(0, 120).map((v) => (
                  <tr key={v.id}>
                    <td><b>{v.title}</b>{v.code ? <span className="muted"> · {v.code}</span> : null}</td>
                    <td>{KIND_LABEL[voucherKind(v)]}</td>
                    <td className="num">{v.minSpend ? vnd(v.minSpend) : "Không"}</td>
                    <td className="num">{v.startAt ? dm(v.startAt) : "?"} – {v.endAt ? dm(v.endAt) : "?"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="tickets">{r.list.slice(0, 60).map((v) => <VoucherTicket key={v.id} v={v} now={now} />)}</div>
        )}
      </section>

      {r.expired.length > 0 && (
        <section className="section">
          <details className="vm-expired">
            <summary>{r.expired.length} mã {p} đã hết hạn trong {monthName(ref)}</summary>
            <ul>
              {r.expired.slice(0, 60).map((v) => (
                <li key={v.id}>{v.title}{v.minSpend ? ` · đơn từ ${vnd(v.minSpend)}` : ""}{v.endAt ? ` · hết hạn ${dm(v.endAt)}` : ""}</li>
              ))}
            </ul>
          </details>
        </section>
      )}

      <section className="section panel" aria-labelledby="tip-head">
        <h2 id="tip-head">Dùng mã {p} sao cho có lợi</h2>
        <ul className="vm-tips">
          <li>Lưu mã ngay khi mở vào ngày sale: mã lớn thường hết lượt sau vài phút. Thêm món vào giỏ từ trước.</li>
          <li>Mã giảm theo % có <b>mức giảm tối đa</b>: đơn lớn hơn mức đó không được giảm thêm.</li>
          <li>Chỉ mua thêm cho đủ đơn tối thiểu khi món mua thêm là thứ bạn vẫn định mua.</li>
          <li>Giá sau mã mới là giá thật: tính đủ mã shop, mã sàn và phí ship bằng <Link href="/tinh-gia">Máy tính giá cuối cùng</Link>.</li>
          <li>Trước ngày sale, xem <Link href="/nang-gia">món nào đang bị nâng giá</Link> để không mua phải giá “giảm” ảo.</li>
        </ul>
      </section>

      <section className="section roundup-faq" aria-labelledby="faq-head">
        <div className="section-head"><h2 id="faq-head">Câu hỏi thường gặp</h2></div>
        {faq.map((f) => (
          <details key={f.q} open>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </section>

      <section className="section" aria-labelledby="more-head">
        <div className="section-head"><h2 id="more-head">Mã giảm giá khác</h2></div>
        <nav className="chips wrap">
          {sameMonth.map((x) => <Link key={x.slug} className="chip" href={`/ma-giam-gia/${x.slug}`}>{platformLabel(x.platform)} {monthName(x)}</Link>)}
          {otherMonths.map((x) => <Link key={x.slug} className="chip" href={`/ma-giam-gia/${x.slug}`}>{p} {monthName(x)}</Link>)}
          <Link className="chip" href="/vouchers">Tất cả mã còn hạn</Link>
        </nav>
      </section>
    </>
  );
}

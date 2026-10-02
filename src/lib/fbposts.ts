/**
 * Các mẫu bài Facebook dựa trên số liệu thật của Săn Deal.
 * Mỗi bài gồm THÂN BÀI (không có link – bài có link ngoài thường bị giảm tiếp cận) và BÌNH LUẬN ĐẦU (link, mã giảm,
 * giờ lấy giá, ghi chú tiếp thị liên kết). Mẫu nào thiếu dữ liệu thì không tạo (trả null) – không bịa số.
 */
import type { Product } from "@/db/schema";
import type { Advice } from "./advice";
import type { FakeDeal } from "./fakedeals";
import { PLATFORMS, soldText } from "./format";
import { priceK } from "./social";

/** Link ngắn cho bình luận: https://ten-mien/p/4004 (chuyển tới trang sản phẩm, tự gắn nguồn facebook) */
export const shortLink = (site: string, p: { id: number }) => `${site}/p/${p.id}`;
/** Link tiếp thị liên kết của món trên sàn (vd https://s.shopee.vn/…); null nếu không có link thật */
export const affLink = (p: { affiliateUrl?: string | null }) => (p.affiliateUrl && /^https?:\/\/\S+$/i.test(p.affiliateUrl) ? p.affiliateUrl : null);
/** Ảnh Story dọc 9:16 (1080×1920) cho mẫu bài: tối đa 4 món */
export const storyUrl = (site: string, kind: string, ids: number[]) => `${site}/story?k=${kind}&p=${ids.slice(0, 4).join(",")}`;
import { unitPrice, unitPriceText, perBase, type UnitPrice } from "./unitprice";

export type PostKind =
  | "that-hay-ao" | "mua-hay-cho" | "don-vi" | "doan-gia" | "ky-luc"
  | "so-san" | "sau-ma" | "vua-giam" | "tong-hop" | "nang-gia" | "boc-gia-ao" | "gioi-thieu";

export const POST_KINDS: { kind: PostKind; label: string; hint: string }[] = [
  { kind: "that-hay-ao", label: "Giảm thật hay ảo?", hint: "So % shop ghi với giá thường ngày" },
  { kind: "mua-hay-cho", label: "Mua ngay hay chờ sale?", hint: "Dự kiến giá ở đợt sale tới" },
  { kind: "don-vi", label: "Giá theo đơn vị", hint: "đ/lít, đ/đôi… so món cùng loại" },
  { kind: "doan-gia", label: "Đoán giá", hint: "Câu đố A/B/C, đáp án ở bình luận" },
  { kind: "ky-luc", label: "Giá thấp kỷ lục", hint: "Thấp nhất từ khi theo dõi" },
  { kind: "so-san", label: "So giá các sàn", hint: "Cùng món, sàn nào rẻ hơn" },
  { kind: "sau-ma", label: "Giá sau mã", hint: "Mã giảm để ở bình luận" },
  { kind: "vua-giam", label: "Vừa giảm hôm nay", hint: "Giảm ≥5% trong 24 giờ" },
  { kind: "tong-hop", label: "Tổng hợp theo ngân sách", hint: "Nhiều món dưới 1 mức giá" },
  { kind: "nang-gia", label: "Ai nâng giá trước sale?", hint: "Số liệu trang /nang-gia" },
  { kind: "boc-gia-ao", label: "Bóc giá ảo", hint: "Món ghi giảm sâu nhưng giá như mọi ngày (tự đăng thứ 4, thứ 7)" },
  { kind: "gioi-thieu", label: "Giới thiệu deal", hint: "Dự phòng khi món chưa đủ số liệu cho mẫu khác" },
];

export interface PostDraft {
  kind: PostKind;
  label: string;
  body: string;
  comment: string;
  /** Ảnh đăng kèm (ảnh giá do Săn Deal tạo) */
  image: string;
  /** Ảnh Story dọc 9:16 đi kèm bài */
  story: string;
  /** Link chính (bình luận đầu) */
  link: string;
  productIds: number[];
}

/** Dữ liệu 1 sản phẩm đã tính sẵn cho các mẫu bài */
export interface PostCtx {
  p: Product;
  site: string;
  now: Date;
  advice: Advice;
  withVoucher?: { code: string | null; title: string; price: number } | null;
  recordLow?: boolean;
  droppedAt?: Date | null;
  droppedBy?: number | null;
  /** Giá rẻ nhất cùng món theo từng sàn (≥ 2 sàn) */
  offers?: { platform: string; price: number; id: number; name?: string | null }[];
  /** Món cùng loại đơn vị để so (đắt hơn theo đơn vị) */
  unitPeer?: { p: Product; u: UnitPrice } | null;
}

const LABEL = Object.fromEntries(POST_KINDS.map((k) => [k.kind, k.label])) as Record<PostKind, string>;
const plat = (p: { platform: string }) => PLATFORMS[p.platform]?.label ?? p.platform;
/** Tên sản phẩm đầy đủ (không cắt “…”), chỉ gọn khoảng trắng */
const fullName = (name: string) => name.replace(/\s+/g, " ").trim();
const hhmm = (d: Date) => d.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
const dm = (d: Date) => d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
const tags = (p?: Product) => ["#SănDeal", p ? `#${plat(p).replace(/\s+/g, "")}` : "#DealGiảmThật", "#GiáThật"].join(" ");
const CTA = "👇 Link mua + lịch sử giá ở bình luận đầu";

function commentFor(ctx: { site: string; now: Date }, lines: string[], at: Date) {
  return [
    ...lines,
    `⏱ Giá lấy lúc ${hhmm(at)}, có thể thay đổi – kiểm tra lại trên sàn trước khi thanh toán.`,
    "ℹ️ Link tiếp thị liên kết, giá bạn trả không đổi.",
  ].join("\n");
}

function single(ctx: PostCtx, kind: PostKind, bodyLines: (string | false | null | undefined)[], extra: string[] = []): PostDraft {
  const { p, site } = ctx;
  const link = shortLink(site, p);
  const v = ctx.withVoucher && ctx.withVoucher.price < p.price ? ctx.withVoucher : null;
  return {
    kind,
    label: LABEL[kind],
    body: [...bodyLines.filter(Boolean), "", CTA, tags(p)].join("\n"),
    comment: commentFor(ctx, [
      `📊 Xem lịch sử giá trên Săn Deal: ${link}`,
      ...(affLink(p) ? [`🛒 Mua thẳng trên ${plat(p)}: ${affLink(p)}`] : []),
      ...(v ? [`🎟 ${v.code ? `Nhập mã ${v.code}` : `Dùng mã sàn "${v.title}"`} còn ${priceK(v.price)} (khi đơn đủ điều kiện)`] : []),
      ...extra,
    ], p.lastSeenAt ?? ctx.now),
    image: `${site}/product/${p.id}/opengraph-image`,
    story: storyUrl(site, kind, [p.id]),
    link,
    productIds: [p.id],
  };
}

const social = (p: Product) => [p.rating ? `⭐ ${p.rating.toFixed(1)}` : "", p.sold ? `${soldText(p.sold)} đã bán` : ""].filter(Boolean).join(" · ");

/** 1. Giảm thật hay ảo: % shop ghi vs giá thường ngày theo lịch sử */
export function thatHayAo(ctx: PostCtx): PostDraft | null {
  const { p, advice: a } = ctx;
  if (!(p.originalPrice && p.originalPrice > p.price && p.discountPct >= 10 && a.trackedDays >= 7)) return null;
  const claim = Math.round(p.discountPct);
  const real = Math.max(0, Math.round(a.belowUsualPct));
  const honest = real >= claim - 5;
  const verdict = real >= 10 ? "rẻ thật, đáng mua nếu bạn đang cần." : real >= 3 ? "có rẻ hơn chút, nhưng không nhiều như % shop ghi." : "giá gạch chỉ để “trưng”, đây là giá bình thường của món này.";
  return single(ctx, "that-hay-ao", [
    honest
      ? `🔍 Shop ghi −${claim}%, Săn Deal kiểm tra: giảm THẬT ✅`
      : real >= 10
        ? `🔍 Shop ghi −${claim}%, thực tế rẻ hơn giá thường ngày ${real}% – vẫn là giá tốt 👍`
        : `🔍 Shop ghi −${claim}%… nhưng giảm thật chỉ ${real}% 🤔`,
    `🛍 ${fullName(p.name)}`,
    `🏷 Giá gạch trên sàn: ${priceK(p.originalPrice)} → ${priceK(p.price)}`,
    `📊 Giá thường ngày ${Math.floor(a.trackedDays)} ngày qua: ${priceK(a.usual)} · thấp nhất ${priceK(a.low)}`,
    `👉 Kết luận: ${verdict}`,
  ]);
}

/** 2. Mua ngay hay chờ sale (dự kiến giá đợt sale tới) */
export function muaHayCho(ctx: PostCtx): PostDraft | null {
  const f = ctx.advice.forecast;
  if (!f) return null;
  const { p } = ctx;
  return single(ctx, "mua-hay-cho", f.pct >= 3
    ? [
        `⏳ Có nên chờ ${f.sale}? Món này dự kiến rẻ thêm ~${priceK(f.save)}`,
        `🛍 ${fullName(p.name)}`,
        `💰 Giá hôm nay: ${priceK(p.price)}`,
        `📅 Dự kiến ${f.sale} (còn ${f.days} ngày): ~${priceK(f.expected)} (−${f.pct}%)`,
        `📊 Dựa trên ${f.basisText}. Chỉ là ước tính từ lịch sử giá, không phải cam kết.`,
        "👉 Không gấp thì bấm “Báo khi giảm” để được nhắc đúng lúc.",
      ]
    : [
        `✅ Không cần chờ ${f.sale}: món này đang ở giá tốt`,
        `🛍 ${fullName(p.name)}`,
        `💰 Giá hôm nay: ${priceK(p.price)}`,
        `📊 Dựa trên ${f.basisText}: đợt sale trước giá gần như không rẻ hơn mức này.`,
        social(p) && `👥 ${social(p)}`,
      ]);
}

/** 3. Giá theo đơn vị (so với món cùng loại nếu có) */
export function donVi(ctx: PostCtx): PostDraft | null {
  const { p } = ctx;
  const u = unitPrice(p.name, p.price);
  if (!u) return null;
  const peer = ctx.unitPeer && ctx.unitPeer.u.compareKey === u.compareKey && perBase(ctx.unitPeer.u) > perBase(u) * 1.05 ? ctx.unitPeer : null;
  const cheaperPct = peer ? Math.round((1 - perBase(u) / perBase(peer.u)) * 100) : 0;
  return single(ctx, "don-vi", [
    peer ? `🧮 Mua cái nào lợi hơn? Tính theo ${u.label} mới biết` : `🧮 ${priceK(p.price)} cho ${u.qtyText} = ${unitPriceText(u)}`,
    `🛍 ${fullName(p.name)}`,
    `💰 ${priceK(p.price)} · ${u.qtyText} → ${unitPriceText(u)}`,
    peer && `🆚 ${fullName(peer.p.name)}: ${priceK(peer.p.price)} · ${peer.u.qtyText} → ${unitPriceText(peer.u)}`,
    peer && `👉 Món đầu rẻ hơn ${cheaperPct}% tính theo ${u.label}.`,
    !peer && social(p) && `👥 ${social(p)}`,
  ], peer ? [`🆚 Món so sánh: ${shortLink(ctx.site, peer.p)}`] : []);
}

/** 4. Đoán giá: hỏi giá thấp nhất, 3 lựa chọn, đáp án ở bình luận */
export function doanGia(ctx: PostCtx): PostDraft | null {
  const { p, advice: a } = ctx;
  if (a.trackedDays < 7 || !(a.low > 0) || a.low >= p.price * 0.98) return null;
  const r = (x: number) => Math.round(x / 1000) * 1000;
  const truth = r(a.low);
  const decoys = [r(a.low * 0.82), r(Math.min(p.price * 0.97, a.low * 1.12))].filter((x) => x !== truth && x > 0);
  if (decoys.length < 2 || decoys[0] === decoys[1]) return null;
  const opts = [truth, ...decoys];
  // Trộn theo id sản phẩm (cố định cho cùng món)
  const order = [[0, 1, 2], [1, 0, 2], [1, 2, 0], [2, 0, 1], [0, 2, 1], [2, 1, 0]][p.id % 6];
  const shown = order.map((i) => opts[i]);
  const letter = "ABC"[shown.indexOf(truth)];
  const draft = single(ctx, "doan-gia", [
    `🤔 ĐOÁN GIÁ: giá THẤP NHẤT ${Math.floor(a.trackedDays)} ngày qua của món này là bao nhiêu?`,
    `🛍 ${fullName(p.name)}`,
    `💰 Giá hôm nay: ${priceK(p.price)}`,
    "",
    ...shown.map((x, i) => `${"ABC"[i]}. ${priceK(x)}`),
    "",
    "💬 Bình luận A, B hoặc C trước khi xem đáp án nhé!",
  ]);
  draft.comment = `✅ Đáp án: ${letter}. ${priceK(truth)}${a.lowAt ? ` (ngày ${dm(a.lowAt)})` : ""} – hôm nay ${priceK(p.price)}.\n` + draft.comment;
  return draft;
}

/** 5. Giá thấp kỷ lục */
export function kyLuc(ctx: PostCtx): PostDraft | null {
  const { p, advice: a } = ctx;
  if (!(ctx.recordLow || (a.trackedDays >= 14 && p.price <= a.low))) return null;
  const save = a.usual - p.price;
  return single(ctx, "ky-luc", [
    `🏆 GIÁ THẤP NHẤT ${Math.floor(a.trackedDays)} NGÀY – ${plat(p).toUpperCase()}`,
    `🛍 ${fullName(p.name)}`,
    `💰 ${priceK(p.price)}${save >= 1000 ? ` · rẻ hơn giá thường ngày ${priceK(save)}` : ""}`,
    `📊 Săn Deal theo dõi giá món này ${Math.floor(a.trackedDays)} ngày, chưa lần nào thấp hơn mức này.`,
    social(p) && `👥 ${social(p)}`,
  ]);
}

/** 6. So giá các sàn */
export function soSan(ctx: PostCtx): PostDraft | null {
  const offers = [...(ctx.offers ?? [])].sort((x, y) => x.price - y.price);
  if (offers.length < 2) return null;
  const [best, ...rest] = offers;
  const worst = rest[rest.length - 1];
  const diff = worst.price - best.price;
  if (diff < 1000) return null;
  const { p } = ctx;
  const draft = single(ctx, "so-san", [
    `⚖️ Cùng một món, ${plat(best)} rẻ hơn ${plat(worst)} ${priceK(diff)}`,
    `🛍 ${fullName(p.name)}`,
    ...offers.map((o) => `${o === best ? "✅" : "▫️"} ${plat(o)}: ${priceK(o.price)}`),
    "👉 Trước khi bấm mua, so giá các sàn mất 10 giây mà tiết kiệm được kha khá.",
  ]);
  draft.comment = offers.map((o) => `${plat(o)}: ${shortLink(ctx.site, o)}`).join("\n") + "\n" + draft.comment.split("\n").slice(1).join("\n");
  return draft;
}

/** 7. Giá sau mã (mã để ở bình luận) */
export function sauMa(ctx: PostCtx): PostDraft | null {
  const v = ctx.withVoucher;
  const { p } = ctx;
  if (!v || v.price >= p.price - 1000) return null;
  return single(ctx, "sau-ma", [
    `🎟 ${priceK(p.price)} → chỉ còn ${priceK(v.price)} khi áp mã`,
    `🛍 ${fullName(p.name)}`,
    `💸 Bớt thêm ${priceK(p.price - v.price)} nhờ mã ${v.code ? "giảm giá" : "của sàn"} đang còn hạn`,
    social(p) && `👥 ${social(p)}`,
    "🔑 Mã ở bình luận đầu – mã thường hết lượt nhanh.",
  ]);
}

/** 8. Vừa giảm hôm nay */
export function vuaGiam(ctx: PostCtx): PostDraft | null {
  const { p } = ctx;
  if (!ctx.droppedAt || !ctx.droppedBy || ctx.droppedBy < 1000 || ctx.now.getTime() - ctx.droppedAt.getTime() > 86_400_000) return null;
  const pct = Math.round((ctx.droppedBy / (p.price + ctx.droppedBy)) * 100);
  return single(ctx, "vua-giam", [
    `📉 VỪA GIẢM ${priceK(ctx.droppedBy)} (−${pct}%) lúc ${hhmm(ctx.droppedAt)}`,
    `🛍 ${fullName(p.name)}`,
    `💰 ${priceK(p.price + ctx.droppedBy)} → ${priceK(p.price)}`,
    `📊 Giá thường ngày: ${priceK(ctx.advice.usual)}`,
    "⚡ Giá vừa đổi thường không giữ lâu.",
  ]);
}

/** 9. Tổng hợp theo ngân sách (nhiều món) */
export function tongHop(items: Product[], opts: { site: string; now: Date; budget?: number; title?: string; min?: number }): PostDraft | null {
  const list = items.slice(0, 5);
  if (list.length < (opts.min ?? 3)) return null;
  const links = list.map((p, i) => [`${i + 1}. ${shortLink(opts.site, p)}`, ...(affLink(p) ? [`   🛒 ${plat(p)}: ${affLink(p)}`] : [])].join("\n"));
  const oldest = list.reduce((m, p) => (p.lastSeenAt < m ? p.lastSeenAt : m), list[0].lastSeenAt);
  return {
    kind: "tong-hop",
    label: LABEL["tong-hop"],
    body: [
      opts.title ?? `💸 ${list.length} món dưới ${priceK(opts.budget ?? Math.max(...list.map((p) => p.price)))} đang giảm thật`,
      "",
      ...list.map((p, i) => `${i + 1}. ${fullName(p.name)} – ${priceK(p.price)}${p.realDropPct >= 5 ? ` (giảm thật ${Math.round(p.realDropPct)}%)` : ""}`),
      "",
      "Giảm thật = rẻ hơn giá thường ngày 30 ngày qua, không tính % shop tự ghi.",
      `👇 Link từng món ở bình luận đầu (đánh số 1–${list.length})`,
      tags(),
    ].join("\n"),
    comment: commentFor(opts, links, oldest),
    image: `${opts.site}/product/${list[0].id}/opengraph-image`,
    story: storyUrl(opts.site, "tong-hop", list.map((p) => p.id)),
    link: shortLink(opts.site, list[0]),
    productIds: list.map((p) => p.id),
  };
}

/** 10. Ai nâng giá trước sale (số liệu trang /nang-gia) */
export function nangGia(r: { total: number; rate: number; raised: { product: Product; base: number; peak: number }[] }, opts: { site: string; now: Date; sale: string; slug: string; upcoming: boolean }): PostDraft | null {
  if (r.total < 10 || !r.raised.length) return null;
  const pct = Math.round(r.rate * 100);
  const top = r.raised.slice(0, 3);
  const link = `${opts.site}/nang-gia/${opts.slug}?utm_source=facebook&utm_medium=social`;
  return {
    kind: "nang-gia",
    label: LABEL["nang-gia"],
    body: [
      `🚨 ${pct}% món Săn Deal theo dõi đã tăng giá ${opts.upcoming ? `trong 14 ngày qua, trước ${opts.sale}` : `trong 2 tuần trước ${opts.sale}`}`,
      `(${r.raised.length}/${r.total} món tăng từ 8% trở lên so với giá thường ngày)`,
      "",
      "Ví dụ:",
      ...top.map((x) => `• ${fullName(x.product.name)}: ${priceK(x.base)} → ${priceK(x.peak)} (+${Math.round((x.peak / x.base - 1) * 100)}%)`),
      "",
      opts.upcoming ? `👉 Ngày ${opts.sale} thấy “giảm 50%” thì so với giá cũ trước đã nhé.` : "👉 Lần sale sau nhớ so giá trước khi mua.",
      "👇 Bảng đầy đủ theo shop, danh mục ở bình luận đầu",
      tags(),
    ].join("\n"),
    comment: commentFor(opts, [`📊 Bảng đầy đủ: ${link}`, "Số liệu chỉ tính các món Săn Deal đang theo dõi, không đại diện cho toàn sàn."], opts.now),
    image: `${opts.site}/nang-gia/${opts.slug}/opengraph-image`,
    story: storyUrl(opts.site, "nang-gia", top.map((x) => x.product.id)),
    link,
    productIds: top.map((x) => x.product.id),
  };
}

/**
 * 12. Bóc giá ảo: 2–3 món ghi giảm sâu nhưng giá hiện tại gần như bằng giá thường ngày.
 * Chỉ nêu số liệu giá (không kết luận về shop); bình luận đầu là link lịch sử giá trên Săn Deal, KHÔNG có link mua.
 */
export function bocGiaAo(items: FakeDeal[], opts: { site: string; now: Date }): PostDraft | null {
  const top = items.slice(0, 3);
  if (top.length < 2) return null;
  const num = ["1️⃣", "2️⃣", "3️⃣"];
  const real = (r: number) => (r >= 0.5 ? `chỉ rẻ hơn ${Math.round(r)}%` : r <= -0.5 ? `còn ĐẮT hơn ${Math.round(-r)}%` : "y như mọi ngày");
  const short = (n: string) => {
    const f = fullName(n);
    return f.length > 80 ? `${f.slice(0, 79).trim()}…` : f;
  };
  const link = `${opts.site}/giam-gia-ao?utm_source=facebook&utm_medium=social&utm_campaign=boc-gia-ao`;
  const at = top.reduce((d, x) => (x.p.lastSeenAt && x.p.lastSeenAt > d ? x.p.lastSeenAt : d), new Date(0));
  return {
    kind: "boc-gia-ao",
    label: LABEL["boc-gia-ao"],
    body: [
      "🔍 BÓC GIÁ ẢO TUẦN NÀY",
      "Ghi giảm sâu, nhưng so với lịch sử giá thật thì…",
      "",
      ...top.flatMap((x, i) => [
        `${num[i]} ${short(x.p.name)} (${plat(x.p)})`,
        `🏷 Ghi giảm ${x.claim}%${x.p.originalPrice && x.p.originalPrice > x.p.price ? `: ${priceK(x.p.originalPrice)} → ${priceK(x.p.price)}` : ""}`,
        `📊 Giá thường ngày ${Math.floor(x.days)} ngày qua: ${priceK(x.usual)} → giá này ${real(x.real)}`,
        "",
      ]),
      "👉 Giá gạch không phải giá thật. Trước khi mua, xem món đó thường ngày bán bao nhiêu.",
      "🔔 Theo dõi Trang để tuần nào cũng biết món nào “giảm” ảo.",
      "👇 Lịch sử giá từng món + danh sách đầy đủ ở bình luận đầu",
      "#SănDeal #GiảmGiáẢo #GiáThật",
    ].join("\n"),
    comment: commentFor(opts, [
      `📋 Danh sách đầy đủ: ${link}`,
      ...top.map((x, i) => `${num[i]} Lịch sử giá: ${shortLink(opts.site, x.p)}`),
      "Số liệu từ lịch sử giá Săn Deal ghi nhận, chỉ nói về giá – không đánh giá shop hay chất lượng sản phẩm.",
    ], at.getTime() ? at : opts.now),
    image: `${opts.site}/giam-gia-ao/anh?p=${top.map((x) => x.p.id).join(",")}`,
    story: storyUrl(opts.site, "boc-gia-ao", top.map((x) => x.p.id)),
    link,
    productIds: top.map((x) => x.p.id),
  };
}

/**
 * 11. Giới thiệu deal – mẫu dự phòng, luôn tạo được: chỉ dùng thông tin chắc chắn có (tên, giá, giá gạch sàn hiển thị,
 * điểm sao, lượt bán, shop). Dùng khi món chưa đủ lịch sử giá cho các mẫu khác (vd món mới nhập từ file CSV).
 */
export function gioiThieu(ctx: PostCtx): PostDraft {
  const { p, advice: a } = ctx;
  const tracked = a.trackedDays >= 7;
  const listed = p.originalPrice && p.originalPrice > p.price ? Math.round((1 - p.price / p.originalPrice) * 100) : 0;
  const head = tracked && p.realDropPct >= 5
    ? `💥 Rẻ hơn giá thường ngày ${Math.round(p.realDropPct)}% trên ${plat(p)}`
    : listed >= 5
      ? `🏷 ${plat(p)} đang ghi giảm ${listed}%`
      : `🔥 Deal đáng chú ý trên ${plat(p)}`;
  return single(ctx, "gioi-thieu", [
    head,
    `🛍 ${fullName(p.name)}`,
    `💰 ${listed >= 5 ? `${priceK(p.originalPrice!)} → ` : ""}${priceK(p.price)}${listed >= 5 && !tracked ? " (giá gạch do shop ghi)" : ""}`,
    social(p) && `👥 ${social(p)}`,
    p.shopName && `🏪 ${p.shopType === "mall" ? "Shop Mall chính hãng: " : "Shop: "}${p.shopName}`,
    tracked
      ? `📊 Giá thường ngày ${Math.floor(a.trackedDays)} ngày qua: ${priceK(a.usual)} · thấp nhất ${priceK(a.low)}`
      : "📊 Săn Deal vừa bắt đầu theo dõi giá món này – bấm “Báo khi giảm” để được nhắc khi rẻ hơn.",
  ]);
}

/**
 * Tất cả mẫu đơn (1 sản phẩm) dùng được cho sản phẩm này, theo thứ tự ưu tiên đăng tự động.
 * Không mẫu nào đủ số liệu thì dùng mẫu "Giới thiệu deal" để luôn đăng được.
 */
export function singleDrafts(ctx: PostCtx): PostDraft[] {
  const list = [kyLuc, vuaGiam, thatHayAo, muaHayCho, sauMa, soSan, donVi, doanGia].map((f) => f(ctx)).filter((d): d is PostDraft => !!d);
  return list.length ? list : [gioiThieu(ctx)];
}

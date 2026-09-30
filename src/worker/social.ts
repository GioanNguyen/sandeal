import { and, desc, eq, gte, inArray, notExists, sql } from "drizzle-orm";
import { products, socialPosts, type Product } from "@/db/schema";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/mail";
import { buildCaption, buildDigestCaption, priceK, shareUrl } from "@/lib/social";
import { enrichDeals } from "@/lib/queries";
import { sendTelegram } from "@/lib/telegram";
import { buyAdvice } from "@/lib/advice";
import { categorySaleDrop } from "@/lib/saleforecast";
import { getProduct, listDeals } from "@/lib/queries";
import { currentRaisePage, raiseReport, saleTitle } from "@/lib/salepages";
import { nangGia, singleDrafts, tongHop, type PostCtx, type PostDraft } from "@/lib/fbposts";
import { perBase, unitPrice } from "@/lib/unitprice";

export type Channel = "telegram" | "facebook";

/** Kênh nào đã được cấu hình */
export function channels(): Channel[] {
  const list: Channel[] = [];
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) list.push("telegram");
  if (process.env.FB_PAGE_ID && process.env.FB_PAGE_TOKEN) list.push("facebook");
  return list;
}

/**
 * Chọn deal để đăng: điểm cao, giảm thật ≥10%, giá mới cập nhật trong 24h,
 * chưa đăng lên kênh này 7 ngày qua, mỗi danh mục tối đa 1 món mỗi lượt.
 */
export async function pickDeals(channel: string, limit: number, now = new Date(), onePerCategory = true): Promise<Product[]> {
  const rows = await db
    .select()
    .from(products)
    .where(
      and(
        gte(products.dealScore, Number(process.env.SOCIAL_MIN_SCORE ?? 50)),
        gte(products.realDropPct, 10),
        gte(products.lastSeenAt, new Date(now.getTime() - 86_400_000)),
        notExists(
          db
            .select({ x: sql`1` })
            .from(socialPosts)
            .where(and(eq(socialPosts.channel, channel), eq(socialPosts.productId, products.id), gte(socialPosts.postedAt, new Date(now.getTime() - 7 * 86_400_000)))),
        ),
      ),
    )
    .orderBy(desc(products.dealScore))
    .limit(limit * 6);
  const out: Product[] = [];
  const cats = new Set<string>();
  for (const r of rows) {
    const key = r.category ?? `id${r.id}`;
    if (onePerCategory && cats.has(key)) continue;
    cats.add(key);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

/** Facebook: thân bài không link + link ở bình luận đầu (mặc định). FB_LINK_IN_COMMENT="0" để đăng kiểu cũ (link trong bài) */
const fbLinkInComment = () => process.env.FB_LINK_IN_COMMENT !== "0";

/**
 * Đăng bài ẢNH (ảnh giá Săn Deal tạo) với thân bài không có link, rồi đăng bình luận đầu chứa link.
 * Cần quyền pages_manage_posts + pages_manage_engagement cho token Trang. Trả về id bài.
 */
export async function postFacebookDraft(d: Pick<PostDraft, "body" | "comment" | "image">): Promise<string> {
  const g = `https://graph.facebook.com/v21.0`;
  const token = process.env.FB_PAGE_TOKEN;
  const res = await fetch(`${g}/${process.env.FB_PAGE_ID}/photos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: d.image, caption: d.body, access_token: token }),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; post_id?: string; error?: { message: string } };
  if (!res.ok || !json.id) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  const postId = json.post_id ?? json.id;
  const c = await fetch(`${g}/${postId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: d.comment, access_token: token }),
  });
  if (!c.ok) {
    const cj = (await c.json().catch(() => ({}))) as { error?: { message: string } };
    throw new Error(`Đã đăng bài (${postId}) nhưng không đăng được bình luận đầu: ${cj.error?.message ?? `HTTP ${c.status}`} – hãy bình luận tay`);
  }
  return postId;
}

/** Tính sẵn dữ liệu cho các mẫu bài của 1 sản phẩm */
export async function draftContext(p: Product, now = new Date()): Promise<PostCtx> {
  const [full, [row]] = await Promise.all([getProduct(p.id), enrichDeals([p])]);
  const advice = buyAdvice(full?.prices ?? [], p.price, now, {
    category: p.category ? { name: p.category, drop: await categorySaleDrop(p.category, now) } : undefined,
  });
  // Món cùng danh mục, cùng loại đơn vị, đắt hơn theo đơn vị (để so "mua cái nào lợi hơn")
  let unitPeer: PostCtx["unitPeer"] = null;
  const u = unitPrice(p.name, p.price);
  if (u && p.category) {
    const same = await db.select().from(products).where(and(eq(products.category, p.category), gte(products.lastSeenAt, new Date(now.getTime() - 3 * 86_400_000)))).limit(80);
    for (const q of same) {
      if (q.id === p.id) continue;
      const qu = unitPrice(q.name, q.price);
      if (qu && qu.compareKey === u.compareKey && perBase(qu) > perBase(u) * 1.05 && (!unitPeer || perBase(qu) < perBase(unitPeer.u))) unitPeer = { p: q, u: qu };
    }
  }
  const offerIds = row?.offers?.map((o) => o.id) ?? [];
  const names = offerIds.length ? new Map((await db.select({ id: products.id, name: products.name }).from(products).where(inArray(products.id, offerIds))).map((r) => [r.id, r.name])) : new Map();
  return {
    p,
    site: siteUrl(),
    now,
    advice,
    withVoucher: row?.withVoucher ?? null,
    recordLow: !!row?.recordLow,
    droppedAt: row?.droppedAt ?? null,
    droppedBy: row?.droppedBy ?? null,
    offers: row?.offers?.map((o) => ({ ...o, name: names.get(o.id) })),
    unitPeer,
  };
}

/** Các mẫu bài dùng được cho 1 sản phẩm */
export async function draftsForProduct(p: Product, now = new Date()) {
  return singleDrafts(await draftContext(p, now));
}

/** Mẫu "Tổng hợp theo ngân sách": món đang giảm thật dưới mức giá */
export async function roundupDraft(budget: number, now = new Date()) {
  const { items } = await listDeals({ discounted: true, maxPrice: budget, sort: "drop", pageSize: 5 });
  return tongHop(items, { site: siteUrl(), now, budget });
}

/** Mẫu "Ai nâng giá trước sale" cho đợt sale đang/sắp diễn ra */
export async function raiseDraft(now = new Date()) {
  const pg = currentRaisePage(now);
  if (!pg) return null;
  const r = await raiseReport(pg.event, now);
  return nangGia(r, { site: siteUrl(), now, sale: saleTitle(pg.event), slug: pg.slug, upcoming: pg.state === "upcoming" });
}

async function postFacebook(message: string, link: string): Promise<string> {
  // Đăng lên Trang Facebook: Facebook tự lấy ảnh xem trước (Open Graph) từ link sản phẩm
  const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.FB_PAGE_ID}/feed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, link, access_token: process.env.FB_PAGE_TOKEN }),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; error?: { message: string } };
  if (!res.ok || !json.id) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  return json.id;
}

/** Đăng 1 deal lên 1 kênh, ghi lịch sử. Trả về true nếu thành công. */
export async function postDeal(channel: Channel, p: Product, variant = 0): Promise<boolean> {
  const link = shareUrl(siteUrl(), p, channel);
  let externalId: string | null = null;
  let error: string | null = null;
  try {
    // Mã giảm giá đang áp được + "giá thấp kỷ lục" lấy từ dữ liệu thật như trên thẻ deal
    const [row] = await enrichDeals([p]);
    const extras = { voucher: row?.withVoucher ?? null, recordLow: !!row?.recordLow, at: p.lastSeenAt };
    if (channel === "telegram") {
      const ok = await sendTelegram(process.env.TELEGRAM_CHAT_ID!, buildCaption(p, link, { variant, html: true, ...extras }), p.imageUrl, {
        text: `🛒 Xem deal ${priceK(p.price)}`,
        url: link,
      });
      if (!ok) throw new Error("Telegram từ chối tin nhắn");
    } else if (fbLinkInComment()) {
      const drafts = await draftsForProduct(p);
      const d = drafts[variant % Math.max(1, drafts.length)];
      if (!d) throw new Error("Không có mẫu bài phù hợp cho món này");
      externalId = await postFacebookDraft(d);
    } else {
      externalId = await postFacebook(buildCaption(p, link, { variant, ...extras }), link);
    }
  } catch (err) {
    error = (err as Error).message.slice(0, 300);
    console.warn(`[social] ${channel} lỗi:`, error);
  }
  await db.insert(socialPosts).values({ channel, productId: p.id, externalId, error });
  if (!error && channel === "telegram") await db.update(products).set({ telegramPostedAt: new Date() }).where(eq(products.id, p.id));
  return !error;
}

/** Nội dung bài tổng hợp Facebook cho danh sách deal (dùng chung cho đăng tự động và trang admin) */
export async function digestFor(deals: Product[], channel = "facebook") {
  const rows = new Map((await enrichDeals(deals)).map((d) => [d.id, d]));
  const items = deals.map((p) => ({ product: p, link: shareUrl(siteUrl(), p, channel), voucher: rows.get(p.id)?.withVoucher ?? null }));
  return { message: buildDigestCaption(items, { pageName: process.env.FB_PAGE_NAME }), link: items[0]?.link ?? siteUrl() };
}

/**
 * Đăng 1 bài tổng hợp nhiều deal lên Trang Facebook, ghi lịch sử cho từng sản phẩm (để không đăng lặp).
 * Ảnh xem trước của bài lấy từ link sản phẩm đầu tiên. Trả về số sản phẩm đã đăng.
 */
export async function postFacebookDigest(deals: Product[]): Promise<number> {
  if (!deals.length) return 0;
  let externalId: string | null = null;
  let error: string | null = null;
  try {
    if (fbLinkInComment()) {
      const d = tongHop(deals, { site: siteUrl(), now: new Date(), title: "🔥 DEAL GIẢM THẬT ĐÁNG CHÚ Ý HÔM NAY", min: 2 });
      if (!d) {
        // Chỉ 1 món: đăng bài đơn theo mẫu
        let ok = 0;
        for (const p of deals) if (await postDeal("facebook", p)) ok++;
        return ok;
      }
      externalId = await postFacebookDraft(d);
    } else {
      const { message, link } = await digestFor(deals);
      externalId = await postFacebook(message, link);
    }
  } catch (err) {
    error = (err as Error).message.slice(0, 300);
    console.warn("[social] facebook lỗi:", error);
  }
  await db.insert(socialPosts).values(deals.map((p) => ({ channel: "facebook", productId: p.id, externalId, error })));
  return error ? 0 : deals.length;
}

/** Facebook đăng kiểu tổng hợp (mặc định) hay mỗi sản phẩm 1 bài (FB_POST_STYLE="single") */
const fbDigest = () => (process.env.FB_POST_STYLE || "digest") !== "single";

/** Chạy vào giờ vàng: mỗi kênh đăng SOCIAL_PER_RUN deal (mặc định 3) */
export async function postGoldenHour(now = new Date()): Promise<number> {
  const per = Number(process.env.SOCIAL_PER_RUN ?? process.env.TELEGRAM_PER_RUN ?? 3);
  let n = 0;
  for (const ch of channels()) {
    const deals = await pickDeals(ch, per, now);
    if (ch === "facebook" && fbDigest()) {
      n += await postFacebookDigest(deals);
      continue;
    }
    for (let i = 0; i < deals.length; i++) if (await postDeal(ch, deals[i], now.getDate() + i)) n++;
  }
  return n;
}

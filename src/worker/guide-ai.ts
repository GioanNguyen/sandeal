/**
 * Bài hướng dẫn do AI soạn (cách 3: "AI soạn, quản trị viên duyệt"). Lịch bài viết sẵn hết thì không cần sửa code:
 *   1. Mỗi tuần (thứ Hai 9h15) nếu 3 tuần tới còn < 2 bài và chưa có đủ bài nháp chờ duyệt, gọi Claude soạn 1 bài nháp
 *      từ số liệu thật của site (số món theo dõi, danh mục đang giảm, deal thật, đợt sale sắp tới, tỉ lệ nâng giá).
 *   2. Gửi email cho ADMIN_EMAILS. Quản trị viên đọc bản xem trước ở /admin/huong-dan: Duyệt / Bỏ / Soạn bài khác.
 *   3. Bài đã duyệt xếp vào thứ Ba trống kế tiếp, 8h tự lên site, 8h12 tự đăng Facebook (như bài viết sẵn).
 * .env: ANTHROPIC_API_KEY (bắt buộc) · GUIDES_AI=0 để tắt · GUIDES_AI_MODEL (mặc định claude-sonnet-5-5)
 *       GUIDES_AI_AUTO=1: bài nháp không ai duyệt sau 3 ngày thì tự duyệt (mặc định tắt – luôn chờ người duyệt)
 */
import { and, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { aiGuides, products } from "@/db/schema";
import { availableSql } from "@/lib/availability";
import { db, ensureMigrated } from "@/lib/db";
import { PLATFORMS } from "@/lib/format";
import { cleanBlocks, SITE_FEATURES } from "@/lib/guide-blocks";
import { cleanScene } from "@/lib/guide-covers";
import { draftGuides, liveUpcomingGuides, scheduleGuides } from "@/lib/guides-db";
import { guidePublishAt } from "@/lib/guides";
import { button, escapeHtml, layout, sendMail, siteUrl } from "@/lib/mail";
import { shortName } from "@/lib/productstory";
import { raiseReport } from "@/lib/salepages";
import { upcomingSales, type SaleEvent } from "@/lib/sales";
import { slugify } from "@/lib/slug";
import { nameMatch } from "@/lib/textsearch";

const DAY = 86_400_000;
export const guideAiEnabled = () => !!process.env.ANTHROPIC_API_KEY && process.env.GUIDES_AI !== "0";
const MODEL = () => process.env.GUIDES_AI_MODEL || "claude-sonnet-5-5";

// ---------- Chủ đề ----------

/** Chủ đề bền (không phụ thuộc thời điểm), chưa có trong các bài viết sẵn. scene: gợi ý kiểu ảnh bìa hợp chủ đề */
export const TOPIC_POOL: { key: string; idea: string; scene: string }[] = [
  { key: "freeship", idea: "Phí vận chuyển khi mua online: cách được miễn phí ship và khi nào nên gộp đơn", scene: "vouchers" },
  { key: "size-quan-ao", idea: "Chọn đúng size quần áo, giày dép khi mua online để khỏi phải đổi trả", scene: "reviews" },
  { key: "do-dien-tu", idea: "Mua đồ điện tử online: kiểm tra phiên bản, bảo hành và hàng chính hãng", scene: "compare" },
  { key: "my-pham", idea: "Mua mỹ phẩm online an toàn: nhận biết shop uy tín, hạn dùng và hàng chính hãng", scene: "shop" },
  { key: "bao-gia", idea: "Đặt báo giá thế nào cho đúng: chọn mức giá mong muốn để không bỏ lỡ deal", scene: "chart" },
  { key: "hang-moi-ra", idea: "Sản phẩm mới ra mắt: nên mua ngay hay chờ vài tuần cho giá giảm", scene: "chart" },
  { key: "cung-ten-khac-ban", idea: "Cùng tên, khác phiên bản: cách so đúng sản phẩm trước khi so giá", scene: "compare" },
  { key: "livestream", idea: "Mua hàng qua livestream: giá có thật sự rẻ hơn ngày thường không", scene: "flash" },
  { key: "hang-nhai", idea: "Nhận biết hàng nhái khi mua online qua giá, ảnh và đánh giá", scene: "fakeTag" },
  { key: "gom-don", idea: "Gom đơn với bạn bè, người nhà để đủ điều kiện mã giảm: lợi và hại", scene: "vouchers" },
  { key: "tich-tru", idea: "Mua đồ dùng hằng ngày theo đợt sale: tích trữ bao nhiêu là vừa", scene: "unit" },
  { key: "do-gia-dung-lon", idea: "Mua đồ gia dụng lớn online: so giá, phí vận chuyển và lắp đặt", scene: "compare" },
  { key: "ngan-sach-thang", idea: "Lập ngân sách mua sắm online mỗi tháng để không mua theo cảm hứng", scene: "gift" },
  { key: "do-cho-be", idea: "Mua đồ cho bé online: ưu tiên an toàn và nguồn gốc trước giá rẻ", scene: "shop" },
  { key: "khung-gio", idea: "Giá có thay đổi theo giờ trong ngày không? Khung giờ mở mã và flash sale", scene: "calendar" },
  { key: "doc-trang-san-pham", idea: "Đọc trang sản phẩm trong 1 phút: những dòng cần xem trước khi bấm mua", scene: "fakeTag" },
  { key: "qua-tang-ngan-sach", idea: "Chọn quà tặng online theo ngân sách cho các dịp trong năm", scene: "gift" },
  { key: "giay-the-thao", idea: "Mua giày thể thao online: so giá giữa các sàn và tránh hàng kém chất lượng", scene: "compare" },
  { key: "phu-kien-dien-thoai", idea: "Mua phụ kiện điện thoại (sạc, cáp, tai nghe): rẻ đến mức nào thì đáng lo", scene: "fakeTag" },
  { key: "mua-lai-mon-quen", idea: "Mua lại món dùng thường xuyên: theo dõi giá để luôn mua đúng lúc rẻ", scene: "chart" },
];

const SALE_LEAD = { min: 9, max: 24 };

export interface Topic {
  key: string;
  idea: string;
  scene: string;
  sale?: SaleEvent;
  /** Bài theo từ khoá khách đang tìm (Quản trị › Nhu cầu) */
  query?: string;
}

/** Chủ đề bài theo từ khoá khách đang tìm trên site / Google */
export function queryTopic(q: string): Topic {
  const t = q.replace(/\s+/g, " ").trim().slice(0, 60);
  return {
    key: `q-${slugify(t).slice(0, 60)}`,
    idea: `Khách đang tìm "${t}": hướng dẫn chọn mua ${t} – nên chọn loại nào, mức giá hợp lý bao nhiêu, mua lúc nào rẻ, cần tránh gì. Dựa vào số liệu giá thật trong <so_lieu> (mục khachDangTim)`,
    scene: "compare",
    query: t,
  };
}

/** Chọn chủ đề cho bài đăng ngày `publish`: đợt sale lớn sắp tới (nếu chưa viết) trước, rồi lần lượt các chủ đề bền */
export function pickTopic(used: Set<string>, publish: Date): Topic | null {
  const sale = upcomingSales(publish, 8).find((e) => e.kind !== "payday" && (e.start.getTime() - publish.getTime()) / DAY >= SALE_LEAD.min && (e.start.getTime() - publish.getTime()) / DAY <= SALE_LEAD.max);
  if (sale && !used.has(`sale-${sale.key}`)) {
    const name = sale.name.replace(/ – .*/, "");
    return { key: `sale-${sale.key}`, idea: `Chuẩn bị cho ${name}: lên danh sách, kiểm tra giá và tránh món bị nâng giá trước sale`, scene: "calendar", sale };
  }
  const t = TOPIC_POOL.find((x) => !used.has(x.key));
  return t ?? null;
}

// ---------- Số liệu thật đưa cho AI ----------

const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")} ₫`;
const ddmm = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(5, 10).split("-").reverse().join("/");

export async function guideFacts(publish: Date, topic: Topic, now = new Date()) {
  await ensureMigrated();
  const [counts] = await db
    .select({ tracked: sql<number>`count(*)`, deals: sql<number>`count(*) filter (where ${products.realDropPct} >= 10)` })
    .from(products)
    .where(availableSql());
  const cats = await db
    .select({ category: products.category, n: sql<number>`count(*)`, drop: sql<number>`percentile_cont(0.5) within group (order by ${products.realDropPct})` })
    .from(products)
    .where(and(availableSql(), gte(products.realDropPct, 10), isNotNull(products.category)))
    .groupBy(products.category)
    .orderBy(desc(sql`count(*)`))
    .limit(5);
  const top = await db.select().from(products).where(and(availableSql(), gte(products.realDropPct, 10))).orderBy(desc(products.dealScore)).limit(3);
  const next = upcomingSales(publish, 6).find((e) => e.kind !== "payday" && e.start > publish);
  let raise: { sale: string; rate: number; total: number; categories: { name: string; rate: number }[] } | null = null;
  const forSale = topic.sale ?? (next && (next.start.getTime() - now.getTime()) / DAY <= 30 ? next : undefined);
  if (forSale) {
    const r = await raiseReport(forSale, now);
    if (r.total >= 10) {
      raise = {
        sale: forSale.name.replace(/ – .*/, ""),
        rate: Math.round(r.rate * 100),
        total: r.total,
        categories: r.byCategory.slice(0, 3).map((c) => ({ name: c.label, rate: Math.round(c.rate * 100) })),
      };
    }
  }
  // Bài theo từ khoá: các món khớp đang bán (giá thật, mức giảm thật) để AI viết đúng thị trường
  let khachDangTim: Record<string, unknown> | null = null;
  if (topic.query) {
    const match = await db.select().from(products).where(and(availableSql(), nameMatch(products.name, topic.query))).orderBy(desc(products.dealScore)).limit(40);
    const prices = match.map((p) => p.price).sort((a, b) => a - b);
    khachDangTim = {
      tuKhoa: topic.query,
      soMonDangBan: match.length,
      giaThapNhat: prices.length ? vnd(prices[0]) : null,
      giaPhoBien: prices.length ? vnd(prices[Math.floor(prices.length / 2)]) : null,
      giaCaoNhat: prices.length ? vnd(prices[prices.length - 1]) : null,
      viDu: match.slice(0, 6).map((p) => ({ ten: shortName(p.name), san: PLATFORMS[p.platform]?.label ?? p.platform, gia: vnd(p.price), giamThat: p.realDropPct >= 1 ? `${Math.round(p.realDropPct)}%` : "không giảm" })),
    };
  }
  return {
    ngayDang: ddmm(publish),
    khachDangTim,
    soMonDangTheoDoi: Number(counts?.tracked ?? 0),
    soMonGiamThatTu10Pct: Number(counts?.deals ?? 0),
    danhMucDangGiamNhieu: cats.map((c) => ({ danhMuc: c.category, soMon: Number(c.n), giamThatTrungVi: `${Math.round(Number(c.drop))}%` })),
    viDuDealThat: top.map((p) => ({
      ten: shortName(p.name),
      san: PLATFORMS[p.platform]?.label ?? p.platform,
      giaHomNay: vnd(p.price),
      giaThuongNgay: vnd(p.price / Math.max(0.05, 1 - p.realDropPct / 100)),
      giamThat: `${Math.round(p.realDropPct)}%`,
    })),
    dotSaleSapToi: next ? { ten: next.name.replace(/ – .*/, ""), ngay: ddmm(next.start), conNgaySauNgayDang: Math.ceil((next.start.getTime() - publish.getTime()) / DAY) } : null,
    nangGiaTruocSale: raise
      ? { dotSale: raise.sale, tiLeMonTangGia: `${raise.rate}%`, tinhTren: `${raise.total} món có lịch sử giá đủ dài`, danhMucTangNhieu: raise.categories.map((c) => `${c.name} (${c.rate}%)`) }
      : null,
  };
}

// ---------- Gọi Claude ----------

const SCENE_SPEC = `Các kiểu "scene" (ảnh minh hoạ trên ảnh bìa, chọn 1 kiểu hợp chủ đề; số liệu chỉ để minh hoạ, ngắn gọn):
- {"type":"fakeTag","was":"900.000 ₫","now":"349.000 ₫","pct":"−61%"}
- {"type":"vouchers","items":[{"big":"Giảm 10%","small":"Tối đa 50K · Đơn từ 200K","tone":"red"}, ... 2-3 mục, tone: red|green|gold]}
- {"type":"calendar","days":["9.9","10.10","11.11","12.12"],"hot":"10.10","note":"≤ 46 ký tự"}   (đúng 4 ngày, hot là 1 trong 4)
- {"type":"chart","points":[520,540,500,...  6-12 số dương],"marks":[{"at":3,"label":"11.11"}],"badge":"≤ 24 ký tự"}
- {"type":"compare","rows":[{"name":"Shopee","color":"#ee4d2d","price":"192.000 ₫","tag":"Rẻ nhất"}, ... 2-3 dòng]}  (color: #ee4d2d Shopee, #0f146d Lazada, #111111 TikTok Shop, #d0021b Mall, #5b6170 shop thường; name ≤ 14 ký tự)
- {"type":"shop","name":"≤ 22 ký tự","rating":"4,8","reviews":"3.214 đánh giá","stars":[82,10,3,2,3]}  (stars: % 5★→1★)
- {"type":"reviews","items":[{"stars":5,"text":"≤ 44 ký tự","flag":"tuỳ chọn ≤ 18 ký tự"}, ... 2-3 mục]}
- {"type":"unit","items":[{"name":"≤ 18 ký tự","price":"190.000 ₫","unit":"50.000 ₫/kg"},{"name":"...","price":"...","unit":"...","best":true}]}  (đúng 2 mục)
- {"type":"flash","price":"299.000 ₫","was":"599.000 ₫","time":"01:59:42","sold":86}
- {"type":"gift","items":[{"text":"≤ 34 ký tự","done":true}, ... 3-4 mục]}`;

const SYSTEM = `Bạn là biên tập viên của Săn Deal – trang theo dõi lịch sử giá Shopee, Lazada, TikTok Shop ở Việt Nam, giúp người mua biết món nào giảm giá thật.
Viết bài hướng dẫn mua sắm bằng tiếng Việt có dấu, giọng gần gũi, rõ ràng, thực tế; câu ngắn; không sáo rỗng, không phóng đại, không dùng emoji.

Quy tắc bắt buộc:
- Chỉ dùng con số có trong <so_lieu>. Không bịa số liệu, khảo sát, tỉ lệ hay "theo thống kê". Ví dụ minh hoạ phải ghi rõ là ví dụ (vd "Ví dụ: một món 300K…").
- Không nêu chính sách cụ thể của sàn (số ngày đổi trả, mức phí, điều kiện mã, tên chương trình riêng) vì có thể sai hoặc đã đổi; nếu cần, khuyên người đọc xem điều kiện trên trang sàn.
- Chỉ nhắc tính năng của Săn Deal có trong <tinh_nang>, đúng như mô tả; link chỉ được dùng đúng các đường dẫn đó, cú pháp [chữ](/duong-dan). Không dùng link ngoài.
- Không khuyên vay, trả góp hay đầu tư. Không nhắc tên người thật.
- Bài 500–800 chữ: 1–2 đoạn mở đầu đi thẳng vào vấn đề, 3–6 mục có tiêu đề (h2), có ít nhất 1 danh sách và 1 mẹo (tip), kết bằng việc người đọc có thể làm ngay.
- Có thể **in đậm** vài cụm quan trọng.

Trả về DUY NHẤT một đối tượng JSON, không kèm chữ nào khác:
{"title":"30–90 ký tự, nói rõ lợi ích, không giật tít",
 "description":"80–180 ký tự, tóm tắt bài cho Google và Facebook",
 "kicker":"chủ đề ngắn ≤ 22 ký tự, viết thường như 'Mẹo mua sắm'",
 "points":["đúng 3 ý chính, mỗi ý ≤ 42 ký tự"],
 "related":"deep" | "vouchers" | "sales"   (deep: gắn deal đang giảm thật cuối bài; vouchers: gắn mã giảm giá; sales: gắn đợt sale tới),
 "scene":{...},
 "body":[{"type":"p","text":"..."},{"type":"h2","text":"..."},{"type":"ul","items":["..."]},{"type":"ol","items":["..."]},{"type":"tip","text":"..."}]}

${SCENE_SPEC}`;

export function buildGuidePrompt(topic: Topic, facts: unknown, existingTitles: string[]) {
  const features = SITE_FEATURES.map((f) => `- ${f.path} – ${f.name}: ${f.what}`).join("\n");
  return [
    `Chủ đề bài: ${topic.idea}`,
    `Kiểu ảnh bìa gợi ý: ${topic.scene}`,
    `<so_lieu>\n${JSON.stringify(facts, null, 1)}\n</so_lieu>`,
    `<tinh_nang>\n${features}\n</tinh_nang>`,
    `Các bài đã có (không viết trùng nội dung, có thể dẫn link /huong-dan):\n${existingTitles.map((t) => `- ${t}`).join("\n")}`,
  ].join("\n\n");
}

const str = (v: unknown, min: number, max: number) => {
  const s = typeof v === "string" ? v.replace(/[<>{}]/g, "").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim() : "";
  return s.length >= min && s.length <= max ? s : null;
};

export interface GuideDraftData {
  title: string;
  description: string;
  kicker: string;
  points: string[];
  related: "deep" | "vouchers" | "sales";
  scene: Record<string, unknown>;
  body: { type: string; text?: string; items?: string[] }[];
}

/** Đọc và kiểm tra JSON AI trả về. Trả về lỗi cụ thể để ghi log khi không dùng được */
export function parseGuideReply(text: string): { ok: true; data: GuideDraftData } | { ok: false; error: string } {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { ok: false, error: "không có JSON" };
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(m[0]);
  } catch {
    return { ok: false, error: "JSON hỏng" };
  }
  const title = str(j.title, 20, 100);
  const description = str(j.description, 60, 200);
  const kicker = str(j.kicker, 3, 24) ?? "Mẹo mua sắm";
  const points = Array.isArray(j.points) ? j.points.map((p) => str(p, 3, 46)).filter((p): p is string => !!p).slice(0, 3) : [];
  const body = cleanBlocks(j.body);
  if (!title) return { ok: false, error: "tiêu đề không hợp lệ" };
  if (!description) return { ok: false, error: "mô tả không hợp lệ" };
  if (points.length !== 3) return { ok: false, error: "cần đúng 3 ý chính" };
  if (!body) return { ok: false, error: "nội dung quá ngắn hoặc sai định dạng" };
  const scene = cleanScene(j.scene) ?? { type: "chart", points: [520, 540, 500, 530, 480, 470, 450], badge: "Giảm thật" };
  const related = (["deep", "vouchers", "sales"].includes(j.related as string) ? j.related : "deep") as GuideDraftData["related"];
  return { ok: true, data: { title, description, kicker, points, related, scene: scene as unknown as Record<string, unknown>, body } };
}

async function callClaude(system: string, user: string, fetchImpl: typeof fetch) {
  const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: AbortSignal.timeout(180_000),
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL(), max_tokens: 6000, system, messages: [{ role: "user", content: user }] }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  return (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
}

// ---------- Lịch ----------

/** Ngày đăng trống kế tiếp: thứ Ba sau bài cuối cùng trong lịch (ít nhất từ ngày mai), dạng YYYY-MM-DD */
export async function nextFreeSlot(now = new Date()): Promise<string> {
  const all = await scheduleGuides();
  const last = all.reduce((t, g) => Math.max(t, guidePublishAt(g).getTime()), 0);
  const vn = (t: number) => new Date(t + 7 * 3_600_000);
  let d = vn(Math.max(last, now.getTime()));
  d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
  while (d.getUTCDay() !== 2) d = new Date(d.getTime() + DAY);
  return d.toISOString().slice(0, 10);
}

async function usedTopics() {
  const rows = await db.select({ topic: aiGuides.topic }).from(aiGuides);
  return new Set(rows.map((r) => r.topic));
}

async function uniqueSlug(title: string) {
  const base = slugify(title).slice(0, 80).replace(/-+$/, "") || "bai-huong-dan";
  const all = new Set([...(await scheduleGuides()).map((g) => g.slug), ...(await db.select({ s: aiGuides.slug }).from(aiGuides)).map((r) => r.s)]);
  let slug = base;
  for (let i = 2; all.has(slug); i++) slug = `${base}-${i}`;
  return slug;
}

async function notifyAdmins(title: string, description: string) {
  const to = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const html = layout(
    `<p style="font-size:16px"><b>Có bài hướng dẫn mới chờ bạn duyệt</b></p>
     <p style="font-size:18px;font-weight:700;margin:12px 0 4px">${escapeHtml(title)}</p>
     <p style="color:#5b6170">${escapeHtml(description)}</p>
     <p>Bài do AI soạn từ số liệu Săn Deal. Đọc lại trước khi duyệt; bài chỉ được đăng khi bạn bấm Duyệt.</p>
     <p>${button(`${siteUrl()}/admin/huong-dan`, "Xem và duyệt bài")}</p>`,
  );
  for (const e of to) await sendMail(e, `Bài hướng dẫn chờ duyệt: ${title}`, html).catch((err) => console.error("[guide-ai] không gửi được email:", (err as Error).message));
}

/** Soạn 1 bài nháp. Trả về id bài, hoặc lỗi (không ném lỗi để worker không dừng) */
export async function draftGuide(now = new Date(), fetchImpl: typeof fetch = fetch, override?: Topic): Promise<{ ok: true; id: number; title: string } | { ok: false; error: string }> {
  if (!guideAiEnabled()) return { ok: false, error: "Chưa có ANTHROPIC_API_KEY (hoặc đã tắt bằng GUIDES_AI=0)" };
  await ensureMigrated();
  const slot = await nextFreeSlot(now);
  const publish = new Date(`${slot}T08:00:00+07:00`);
  const used = await usedTopics();
  if (override) {
    // Bài cũ đã bị bỏ thì được soạn lại
    const [dup] = await db.select({ id: aiGuides.id }).from(aiGuides).where(and(eq(aiGuides.topic, override.key), sql`${aiGuides.status} <> 'rejected'`)).limit(1);
    if (dup) return { ok: false, error: "Đã có bài (nháp hoặc đã duyệt) cho từ khoá này – xem ở Quản trị › Hướng dẫn" };
  }
  const topic = override ?? pickTopic(used, publish);
  if (!topic) return { ok: false, error: "Đã dùng hết chủ đề có sẵn – thêm chủ đề vào TOPIC_POOL trong src/worker/guide-ai.ts" };
  try {
    const facts = await guideFacts(publish, topic, now);
    const titles = (await scheduleGuides()).map((g) => g.title);
    const reply = await callClaude(SYSTEM, buildGuidePrompt(topic, facts, titles), fetchImpl);
    const parsed = parseGuideReply(reply);
    if (!parsed.ok) return { ok: false, error: `Bài AI trả về không dùng được: ${parsed.error}` };
    const d = parsed.data;
    const [row] = await db
      .insert(aiGuides)
      .values({ slug: await uniqueSlug(d.title), status: "draft", topic: topic.key, title: d.title, description: d.description, kicker: d.kicker, points: d.points, scene: d.scene, body: d.body, related: d.related, model: MODEL(), createdAt: now })
      .returning({ id: aiGuides.id });
    await notifyAdmins(d.title, d.description);
    console.log(`[guide-ai] đã soạn bài nháp #${row.id}: ${d.title}`);
    return { ok: true, id: row.id, title: d.title };
  } catch (err) {
    return { ok: false, error: (err as Error).message.slice(0, 300) };
  }
}

/** Duyệt: xếp vào thứ Ba trống kế tiếp. Trả về ngày đăng */
export async function approveGuide(id: number, now = new Date()): Promise<string | null> {
  await ensureMigrated();
  const [r] = await db.select().from(aiGuides).where(eq(aiGuides.id, id)).limit(1);
  if (!r || r.status !== "draft") return null;
  const day = await nextFreeSlot(now);
  await db.update(aiGuides).set({ status: "scheduled", publishDate: day, reviewedAt: now }).where(eq(aiGuides.id, id));
  return day;
}

export async function rejectGuide(id: number, now = new Date()) {
  await ensureMigrated();
  await db.update(aiGuides).set({ status: "rejected", reviewedAt: now }).where(and(eq(aiGuides.id, id), eq(aiGuides.status, "draft")));
}

/** Huỷ lịch 1 bài AI đã duyệt nhưng chưa đăng (đưa về bài nháp) */
export async function unscheduleGuide(id: number, now = new Date()) {
  await ensureMigrated();
  const [r] = await db.select().from(aiGuides).where(eq(aiGuides.id, id)).limit(1);
  if (!r || r.status !== "scheduled" || !r.publishDate || new Date(`${r.publishDate}T08:00:00+07:00`) <= now) return false;
  await db.update(aiGuides).set({ status: "draft", publishDate: null }).where(eq(aiGuides.id, id));
  return true;
}

/**
 * Việc hằng tuần: (1) tự duyệt bài nháp quá 3 ngày nếu GUIDES_AI_AUTO=1, (2) soạn thêm bài nháp khi 3 tuần tới
 * còn < 2 bài và chưa có 2 bài nháp chờ duyệt.
 */
export async function ensureGuidePipeline(now = new Date(), fetchImpl: typeof fetch = fetch) {
  if (!guideAiEnabled()) return { drafted: 0, approved: 0 };
  let approved = 0;
  if (process.env.GUIDES_AI_AUTO === "1") {
    const old = await db.select().from(aiGuides).where(and(eq(aiGuides.status, "draft"), lt(aiGuides.createdAt, new Date(now.getTime() - 3 * DAY))));
    for (const r of old) if (await approveGuide(r.id, now)) approved++;
  }
  const soon = (await liveUpcomingGuides(now)).filter((g) => guidePublishAt(g).getTime() - now.getTime() < 21 * DAY).length;
  const drafts = (await draftGuides()).length;
  if (soon >= 2 || drafts >= 2) return { drafted: 0, approved };
  const r = await draftGuide(now, fetchImpl);
  if (!r.ok) console.error("[guide-ai] không soạn được bài:", r.error);
  return { drafted: r.ok ? 1 : 0, approved };
}

/** Bài hướng dẫn AI soạn: kiểm tra nội dung AI trả về, chọn chủ đề, xếp lịch, duyệt/bỏ, hiện trên site và đăng Facebook */
import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "https://sandealgiare.com";
process.env.SOURCES = "mock";
process.env.SMTP_URL = "";
process.env.ADMIN_EMAILS = "chu-site@test.vn";

import { cleanBlocks } from "./guide-blocks";
import { cleanScene } from "./guide-covers";

let ai: typeof import("@/worker/guide-ai");
let gdb: typeof import("./guides-db");
let mail: typeof import("./mail");
let guidesW: typeof import("@/worker/guides");

before(async () => {
  const dbm = await import("./db");
  await dbm.ensureMigrated();
  ai = await import("@/worker/guide-ai");
  gdb = await import("./guides-db");
  mail = await import("./mail");
  guidesW = await import("@/worker/guides");
});

const para = (n: number) => Array.from({ length: n }, (_, i) => `Câu thứ ${i + 1} giải thích cách so giá cho đúng trước khi mua.`).join(" ");
const REPLY = {
  title: "Phí vận chuyển khi mua online: cách được miễn phí ship",
  description: "Khi nào phí ship làm món rẻ hoá đắt, cách gộp đơn hợp lý và dùng mã freeship đúng lúc mà không phải mua thêm đồ không cần.",
  kicker: "Phí vận chuyển",
  points: ["Tính phí ship vào giá cuối", "Gộp đơn khi thật sự cần", "Lưu mã freeship từ sớm"],
  related: "vouchers",
  scene: { type: "vouchers", items: [{ big: "Freeship", small: "Đơn từ 0₫", tone: "green" }, { big: "Giảm 15K", small: "Phí vận chuyển", tone: "gold" }] },
  body: [
    { type: "p", text: `Một món rẻ hơn 10K có thể đắt hơn khi cộng **phí ship**. ${para(8)}` },
    { type: "h2", text: "Tính phí ship vào giá cuối" },
    { type: "p", text: `Dùng [Máy tính giá cuối cùng](/tinh-gia) để cộng trừ đủ các khoản. Xem thêm [trang lạ](https://evil.example/x) và [trang không có](/admin). ${para(10)}` },
    { type: "ul", items: ["Ghi lại phí ship từng shop", "So giá sau ship, không so giá niêm yết", "<script>alert(1)</script>Đừng quên mã"] },
    { type: "h2", text: "Gộp đơn khi thật sự cần" },
    { type: "p", text: para(12) },
    { type: "tip", text: "Mẹo: lưu mã freeship ở trang [Mã giảm giá](/vouchers) trước giờ mở mã." },
  ],
};
const replyText = (o: unknown = REPLY) => `Đây là bài:\n${JSON.stringify(o)}`;

function mockClaude(reply: string, calls: { body: { model: string; system: string; messages: { content: string }[] } }[] = []) {
  return (async (_url: string, init?: { body?: string }) => {
    calls.push({ body: JSON.parse(init?.body ?? "{}") });
    return new Response(JSON.stringify({ content: [{ type: "text", text: reply }] }), { status: 200 });
  }) as unknown as typeof fetch;
}

test("làm sạch nội dung AI: bỏ link ngoài, link tới trang không có, thẻ HTML; nội dung quá ngắn bị loại", () => {
  const b = cleanBlocks(REPLY.body)!;
  const all = JSON.stringify(b);
  assert.doesNotMatch(all, /evil\.example|https?:/);
  assert.doesNotMatch(all, /\(\/admin\)/, "link /admin bị bỏ, giữ chữ");
  assert.match(all, /trang không có/);
  assert.match(all, /\[Máy tính giá cuối cùng\]\(\/tinh-gia\)/, "link nội bộ hợp lệ được giữ");
  assert.doesNotMatch(all, /<script>/);
  assert.equal(cleanBlocks([{ type: "p", text: "ngắn" }]), null);
  assert.equal(cleanBlocks("không phải mảng"), null);
});

test("kiểm tra ảnh bìa AI đề xuất: đúng kiểu thì giữ, sai thì bỏ (dùng ảnh mặc định)", () => {
  assert.equal(cleanScene({ type: "vouchers", items: REPLY.scene.items })?.type, "vouchers");
  assert.equal(cleanScene({ type: "calendar", days: ["1.1", "2.2"], hot: "9.9" }), null);
  assert.equal(cleanScene({ type: "lạ" }), null);
  const c = cleanScene({ type: "compare", rows: [{ name: "Shopee", color: "red;background:url(x)", price: "1 ₫" }, { name: "Lazada", color: "#0f146d", price: "2 ₫" }] }) as { rows: { color: string }[] };
  assert.equal(c.rows[0].color, "#5b6170", "màu lạ bị thay");
});

test("đọc phản hồi AI: lỗi cụ thể khi thiếu trường", () => {
  const ok = ai.parseGuideReply(replyText());
  assert.ok(ok.ok);
  assert.equal(ai.parseGuideReply("xin lỗi").ok, false);
  const bad = ai.parseGuideReply(replyText({ ...REPLY, points: ["một"] }));
  assert.equal(bad.ok, false);
  assert.match((bad as { error: string }).error, /3 ý/);
});

test("chọn chủ đề: đợt sale lớn 9–24 ngày sau ngày đăng được ưu tiên, sau đó lần lượt chủ đề bền", () => {
  const before1111 = new Date("2026-10-27T01:00:00Z"); // 11.11 còn 15 ngày
  const t = ai.pickTopic(new Set(), before1111)!;
  assert.equal(t.key, "sale-2026-11-11");
  assert.match(t.idea, /11\.11/);
  const t2 = ai.pickTopic(new Set(["sale-2026-11-11"]), before1111)!;
  assert.equal(t2.key, ai.TOPIC_POOL[0].key);
  const all = new Set(ai.TOPIC_POOL.map((x) => x.key));
  assert.equal(ai.pickTopic(all, new Date("2026-12-29T01:00:00Z")), null, "hết chủ đề (không có đợt sale nào cách 9–24 ngày)");
  assert.equal(ai.pickTopic(new Set(), new Date("2026-12-08T01:00:00Z"))!.key, "sale-2027-01-01");
});

test("soạn bài nháp từ số liệu thật → chưa hiện trên site, quản trị viên xem trước được, có email báo", async () => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  const calls: Parameters<typeof mockClaude>[1] = [];
  const now = new Date("2026-10-02T05:00:00Z");
  const n0 = mail.outbox.length;
  const r = await ai.draftGuide(now, mockClaude(replyText(), calls));
  assert.ok(r.ok, JSON.stringify(r));
  const req = calls[0].body;
  assert.equal(req.model, "claude-sonnet-5-5");
  assert.match(req.system, /Chỉ dùng con số có trong <so_lieu>/);
  assert.match(req.messages[0].content, /<so_lieu>[\s\S]*soMonDangTheoDoi/);
  assert.match(req.messages[0].content, /\/kiem-tra-gia – Kiểm tra giá/);
  assert.match(req.messages[0].content, /Cách nhận biết giảm giá ảo/, "đưa danh sách bài đã có để tránh trùng");

  const slug = "phi-van-chuyen-khi-mua-online-cach-duoc-mien-phi-ship";
  assert.equal(await gdb.findGuide(slug, now), undefined, "bài nháp không hiện công khai");
  const g = await gdb.findGuide(slug, now, true);
  assert.ok(g?.draft && g.aiId, "quản trị viên xem trước được");
  assert.equal(g!.cover?.kicker, "Phí vận chuyển");
  assert.ok(!(await gdb.livePublishedGuides(now)).some((x) => x.slug === slug));
  const m = mail.outbox.slice(n0).find((x) => x.to === "chu-site@test.vn");
  assert.ok(m, "email báo quản trị viên");
  assert.match(m!.subject, /chờ duyệt: Phí vận chuyển/);
  assert.match(m!.html, /\/admin\/huong-dan/);
});

test("duyệt: xếp vào thứ Ba trống sau bài cuối, tự lên site và tự đăng Facebook đúng ngày", async () => {
  const now = new Date("2026-10-02T06:00:00Z");
  const [d] = await gdb.draftGuides();
  assert.equal(await ai.nextFreeSlot(now), "2026-12-08", "bài viết sẵn cuối cùng 01/12 → thứ Ba kế tiếp");
  assert.equal(await ai.approveGuide(d.id, now), "2026-12-08");
  assert.equal(await ai.approveGuide(d.id, now), null, "không duyệt lại lần 2");
  assert.equal(await ai.nextFreeSlot(now), "2026-12-15");
  const before = new Date("2026-12-08T00:59:00Z");
  const after = new Date("2026-12-08T01:00:00Z");
  assert.equal(await gdb.findGuide(d.slug, before), undefined);
  const live = await gdb.findGuide(d.slug, after);
  assert.ok(live && !live.draft);
  assert.equal((await gdb.livePublishedGuides(after))[0].slug, d.slug, "mới nhất trước");

  // Facebook: bài AI cũng được tự đăng như bài viết sẵn
  process.env.FB_PAGE_ID = "123";
  process.env.FB_PAGE_TOKEN = "tok";
  const posted: string[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: { body?: string }) => {
    const b = JSON.parse(init?.body ?? "{}");
    posted.push(`${url} ${b.url ?? b.message ?? ""}`);
    return new Response(JSON.stringify(String(url).endsWith("/comments") ? { id: "c" } : { id: "1", post_id: "123_1" }), { status: 200 });
  }) as typeof fetch;
  try {
    assert.equal(await guidesW.shareDueGuides(new Date("2026-12-08T01:20:00Z")), 1);
    assert.ok(posted.some((p) => p.includes(`/huong-dan/${d.slug}/anh-bia`)));
  } finally {
    globalThis.fetch = orig;
    delete process.env.FB_PAGE_ID;
    delete process.env.FB_PAGE_TOKEN;
  }
});

test("huỷ lịch bài chưa đăng, bỏ bài nháp, soạn đủ thì không soạn thêm, tự duyệt khi bật GUIDES_AI_AUTO", async () => {
  const now = new Date("2026-10-02T07:00:00Z");
  const [g] = (await gdb.scheduleGuides()).filter((x) => x.aiId);
  assert.equal(await ai.unscheduleGuide(g.aiId!, now), true);
  assert.equal((await gdb.draftGuides()).length, 1);
  await ai.rejectGuide(g.aiId!, now);
  assert.equal((await gdb.draftGuides()).length, 0);
  assert.equal(await gdb.findGuide(g.slug, now, true), undefined, "bài đã bỏ không xem được nữa");

  // Còn nhiều bài trong 3 tuần tới (lịch viết sẵn) → không soạn
  const calls: Parameters<typeof mockClaude>[1] = [];
  assert.deepEqual(await ai.ensureGuidePipeline(now, mockClaude(replyText(), calls)), { drafted: 0, approved: 0 });
  assert.equal(calls.length, 0);
  // Gần hết lịch (sau 24/11 chỉ còn bài 01/12) → soạn 1 bài nháp, chủ đề khác bài đã bỏ
  const late = new Date("2026-11-24T03:00:00Z");
  const r = await ai.ensureGuidePipeline(late, mockClaude(replyText({ ...REPLY, title: "Chọn đúng size quần áo khi mua online để khỏi đổi trả" }), calls));
  assert.equal(r.drafted, 1);
  const [d] = await gdb.draftGuides();
  // Bài đầu (đăng 08/12) lấy chủ đề "chuẩn bị cho 1.1"; bài đã bỏ vẫn tính là đã dùng nên bài này sang chủ đề bền đầu tiên
  assert.equal(d.topic, "freeship", "chủ đề đã dùng (kể cả bài bị bỏ) không lặp lại");
  // Có bài nháp chờ duyệt + bật tự duyệt: sau 3 ngày tự xếp lịch
  process.env.GUIDES_AI_AUTO = "1";
  const r2 = await ai.ensureGuidePipeline(new Date("2026-11-28T03:00:00Z"), mockClaude(replyText({ ...REPLY, title: "Mua đồ điện tử online: kiểm tra phiên bản và bảo hành" }), calls));
  delete process.env.GUIDES_AI_AUTO;
  assert.equal(r2.approved, 1);
  // AI trả về nội dung hỏng: không lưu, báo lỗi rõ
  const bad = await ai.draftGuide(new Date("2026-11-29T03:00:00Z"), mockClaude("{}"));
  assert.equal(bad.ok, false);
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal((await ai.draftGuide(now)).ok, false, "không có khoá API thì không soạn");
});

/** Món "không còn thấy trên sàn": ẩn khỏi danh sách, giữ trang, báo người theo dõi khi thấy lại */
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "http://test.local";
process.env.SMTP_URL = "";

test("món vắng quá 3 ngày so với lần đồng bộ mới nhất của sàn: ẩn khỏi danh sách, thấy lại thì báo", async () => {
  const dbm = await import("./db");
  await dbm.ensureMigrated();
  const schema = await import("@/db/schema");
  const { upsertProduct } = await import("./ingest");
  const q = await import("./queries");
  const av = await import("./availability");
  const { outbox } = await import("./mail");
  const { eq } = await import("drizzle-orm");

  const day = 86_400_000, now = Date.now();
  const mk = (id: string, name: string, platform: "shopee" | "lazada" = "shopee") => ({
    platform, externalId: id, name, category: "Điện tử", discountPct: 20, affiliateUrl: `https://aff/${id}`,
  });
  // Món A: lần cuối thấy 5 ngày trước; món B, C: thấy hôm nay (lần đồng bộ mới nhất của Shopee)
  for (let i = 0; i < 6; i++) await upsertProduct({ ...mk("a", "Tai nghe A"), price: 500_000 - i * 10_000 }, new Date(now - (10 - i) * day));
  const b = await upsertProduct({ ...mk("b", "Tai nghe B"), price: 300_000 }, new Date(now));
  await upsertProduct({ ...mk("c", "Tai nghe C"), price: 350_000 }, new Date(now));
  // Lazada đồng bộ lần cuối 6 ngày trước (nguồn gián đoạn cả sàn) -> KHÔNG bị coi là "không còn thấy"
  const d = await upsertProduct({ ...mk("d", "Tai nghe D", "lazada"), price: 400_000 }, new Date(now - 6 * day));

  const [a] = await dbm.db.select().from(schema.products).where(eq(schema.products.externalId, "a"));
  const latest = await av.platformLatest();
  assert.equal(av.isUnavailable(a, latest), true, "A vắng 5 ngày trong khi Shopee vừa đồng bộ");
  const [dRow] = await dbm.db.select().from(schema.products).where(eq(schema.products.id, d));
  assert.equal(av.isUnavailable(dRow, latest), false, "cả sàn Lazada chưa đồng bộ lại thì không đánh dấu");

  const { items } = await q.listDeals({ pageSize: 50 });
  const ids = items.map((x) => x.id);
  assert.ok(!ids.includes(a.id), "danh sách deal không có món đã vắng");
  assert.ok(ids.includes(b) && ids.includes(d));
  assert.ok((await q.getProduct(a.id)), "trang sản phẩm vẫn còn (không 404)");
  const [bRow] = await dbm.db.select().from(schema.products).where(eq(schema.products.id, b));
  assert.ok(!(await q.similarDeals(bRow, 10)).some((x) => x.id === a.id), "không gợi ý món đã vắng");

  // Người dùng bấm "Báo khi có lại" (theo dõi với giá mục tiêu thấp hơn giá lúc có lại)
  const [u] = await dbm.db.insert(schema.users).values({ email: "cho@test.vn" }).returning();
  await dbm.db.insert(schema.watches).values({ userId: u.id, productId: a.id, targetPrice: 100_000 });
  const before = outbox.length;
  // Đồng bộ thường (không phải lần thấy lại): không gửi
  await upsertProduct({ ...mk("c", "Tai nghe C"), price: 349_000 }, new Date(), { restockCutoff: av.staleCutoff(latest.get("shopee")) });
  assert.equal(outbox.length, before);
  // A xuất hiện lại -> gửi mail "đã thấy lại", dù giá chưa tới mục tiêu
  await upsertProduct({ ...mk("a", "Tai nghe A"), price: 460_000 }, new Date(), { restockCutoff: av.staleCutoff(latest.get("shopee")) });
  const mail = outbox.at(-1)!;
  assert.equal(outbox.length, before + 1);
  assert.equal(mail.to, "cho@test.vn");
  assert.match(mail.subject, /^Đã thấy lại trên sàn: Tai nghe A/);
  assert.match(mail.html, /kiểm tra trên sàn trước khi thanh toán/);
  const [a2] = await dbm.db.select().from(schema.products).where(eq(schema.products.id, a.id));
  assert.equal(av.isUnavailable(a2, await av.platformLatest()), false, "thấy lại thì hết trạng thái vắng");
  assert.ok((await q.listDeals({ pageSize: 50 })).items.some((x) => x.id === a.id), "quay lại danh sách");
});

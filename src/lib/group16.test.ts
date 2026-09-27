/** Nhóm 16: trang shop, so sánh A-B, báo cáo tuần, deal theo ngày – số liệu tính từ lịch sử giá */
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "http://test.local";

test("đường dẫn: tuần ISO, ngày, cặp so sánh", async () => {
  const { weekOf, parseWeek, weekRangeLabel } = await import("./weekly");
  const w = weekOf(new Date("2026-09-27T10:00:00+07:00")); // Chủ nhật
  assert.equal(w.slug, "2026-tuan-39");
  assert.equal(weekRangeLabel(w), "21/09 – 27/09/2026");
  assert.equal(weekOf(new Date("2026-09-28T00:30:00+07:00")).week, 40, "0h30 thứ Hai giờ VN là tuần mới");
  assert.equal(parseWeek("2026-tuan-39")?.start.toISOString(), w.start.toISOString());
  assert.equal(parseWeek("2026-tuan-60"), null);
  assert.equal(weekOf(new Date("2027-01-01T12:00:00+07:00")).slug, "2026-tuan-53");

  const { daySlug, parseDay } = await import("./daily");
  const t = parseDay("27-09-2026")!;
  assert.equal(new Date(t).toISOString(), "2026-09-26T17:00:00.000Z");
  assert.equal(daySlug(t + 5 * 3_600_000), "27-09-2026");
  assert.equal(parseDay("31-02-2026"), null);

  const { versusPath, parseVersus, comparable } = await import("./versus");
  const a = { id: 34, name: "Tai nghe B" }, b = { id: 12, name: "Tai nghe A" };
  assert.equal(versusPath(a, b), "/so-sanh/tai-nghe-a-12-vs-tai-nghe-b-34", "món mã nhỏ trước, 1 cặp 1 địa chỉ");
  assert.deepEqual(parseVersus("tai-nghe-a-12-vs-tai-nghe-b-34"), [12, 34]);
  assert.equal(parseVersus("12-vs-12"), null);
  const c = (name: string, category: string | null) => ({ name, category, groupKey: null });
  assert.equal(comparable(c("Tai nghe A", "Điện tử"), c("Tai nghe B", "Điện tử")), true);
  assert.equal(comparable(c("Tai nghe A", "Điện tử"), c("Chuột B", "Điện tử")), false, "khác loại");
});

test("shop, báo cáo tuần, deal theo ngày tính đúng từ lịch sử giá", async () => {
  const dbm = await import("./db");
  await dbm.ensureMigrated();
  const { upsertProduct } = await import("./ingest");
  const day = 86_400_000;
  const now = Date.now();
  const mk = (id: string, name: string, discountPct: number) => ({
    platform: "shopee" as const, externalId: id, name, category: "Điện tử", shopName: "Shop Test", discountPct, affiliateUrl: `https://aff/${id}`,
  });
  // 3 món, theo dõi 40 ngày giá 500K; món A giảm còn 350K cách đây 2 ngày; món B shop ghi giảm 50% nhưng giá không đổi
  for (let i = 40; i >= 1; i--) {
    const t = new Date(now - i * day);
    await upsertProduct({ ...mk("a", "Tai nghe A", 30), price: i <= 2 ? 350_000 : 500_000 }, t);
    await upsertProduct({ ...mk("b", "Tai nghe B", 50), price: 500_000 }, t);
    await upsertProduct({ ...mk("c", "Tai nghe C", 0), price: 500_000 }, t);
    // 2 món shop khác (đủ 5 món cho báo cáo tuần)
    for (const x of ["d", "e"]) await upsertProduct({ ...mk(x, `Chuột quang ${x}`, 0), shopName: "Shop Khác", price: 200_000 }, t);
  }
  for (const x of ["a", "b", "c"]) await upsertProduct({ ...mk(x, `Tai nghe ${x.toUpperCase()}`, x === "a" ? 30 : x === "b" ? 50 : 0), price: x === "a" ? 350_000 : 500_000 }, new Date(now));

  const { getShopReport, listShops, shopSlug } = await import("./shops");
  assert.equal(shopSlug("shopee", "Shop Test"), "shop-test-shopee");
  assert.deepEqual((await listShops()).map((x) => x.slug), ["shop-test-shopee"], "shop có dưới 3 món không có trang");
  const r = (await getShopReport("shop-test-shopee"))!;
  assert.equal(r.tracked, 3);
  assert.equal(r.realNow, 1, "chỉ món A đang rẻ hơn giá thường ngày");
  assert.equal(r.claimed, 2, "A (30%) và B (50%) có ghi % giảm từ 10%");
  assert.equal(r.inflated, 1, "B ghi giảm 50% nhưng giá không đổi -> ghi cao hơn thực tế");

  const { versusPairs, versusPath } = await import("./versus");
  const pairs = (await versusPairs()).map(({ a, b }) => versusPath(a, b)).sort();
  assert.equal(pairs.length, 4, "Tai nghe A/B/C: 3 cặp; Chuột d/e: 1 cặp");
  assert.ok(pairs.every((p) => /^\/so-sanh\/.+-\d+-vs-.+-\d+$/.test(p)));

  const { dayDrops } = await import("./daily");
  const { vnDayStart } = await import("./pricehist");
  const dropDay = vnDayStart(now - 2 * day);
  const drops = await dayDrops(dropDay);
  assert.equal(drops.length, 1);
  assert.equal(drops[0].product.name, "Tai nghe A");
  assert.equal(drops[0].before, 500_000);
  assert.equal(drops[0].price, 350_000);
  assert.equal((await dayDrops(vnDayStart(now - 10 * day))).length, 0);

  const { weekOf, weekReport } = await import("./weekly");
  const wr = (await weekReport(weekOf(new Date(now - 2 * day))))!;
  assert.ok(wr, "tuần có dữ liệu");
  assert.deepEqual(wr.drops.map((d) => d.product.name), ["Tai nghe A"]);
  assert.equal(Math.round(wr.drops[0].usual), 500_000);
});

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "https://sandeal.test";
process.env.FB_PAGE_ID = "123";
process.env.FB_PAGE_TOKEN = "tok";
process.env.SOCIAL_PER_RUN = "2";

test("đăng giờ vàng: chọn deal khác danh mục, gọi Facebook, không đăng lặp", async () => {
  const dbm = await import("./db");
  await dbm.ensureMigrated();
  const { upsertProduct } = await import("./ingest");
  const schema = await import("@/db/schema");
  const day = 86_400_000, now = Date.now();
  const mk = async (id: string, name: string, category: string) => {
    for (let i = 0; i < 10; i++) await upsertProduct({ platform: "shopee", externalId: id, name, category, price: 1_000_000, discountPct: 40, affiliateUrl: "#", rating: 4.9, sold: 9000 }, new Date(now - (20 - i) * day));
    return upsertProduct({ platform: "shopee", externalId: id, name, category, price: 600_000, discountPct: 40, affiliateUrl: "#", rating: 4.9, sold: 9000 });
  };
  await mk("a", "Tai nghe A", "Điện tử");
  await mk("b", "Chuột B", "Điện tử");
  await mk("c", "Serum C", "Làm đẹp");

  const calls: { url: string; body: { message: string; link: string } }[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: { body: string }) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ id: `post_${calls.length}` }));
  }) as unknown as typeof fetch;
  try {
    const { postGoldenHour, channels } = await import("@/worker/social");
    assert.deepEqual(channels(), ["facebook"]);
    assert.equal(await postGoldenHour(), 2);
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /graph\.facebook\.com\/v21\.0\/123\/feed/);
    assert.match(calls[0].body.link, /utm_source=facebook/);
    const cats = new Set<string>();
    for (const c of calls) cats.add(c.body.message.includes("Serum") ? "lamdep" : "dientu");
    assert.equal(cats.size, 2, "mỗi danh mục 1 bài");
    assert.equal(await postGoldenHour(), 1, "chỉ còn món chưa đăng");
    assert.equal(await postGoldenHour(), 0, "không đăng lặp trong 7 ngày");
    const logged = await dbm.db.select().from(schema.socialPosts);
    assert.equal(logged.length, 3);
  } finally {
    globalThis.fetch = orig;
  }
});

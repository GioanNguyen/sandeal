import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "memory://";

test("bộ lọc: tầm giá, nhiều danh mục, từ khoá, loại trừ, bộ sưu tập", async () => {
  const dbm = await import("./db");
  await dbm.ensureMigrated();
  const { upsertProduct } = await import("./ingest");
  const q = await import("./queries");
  const { filterFromParams } = await import("./dealParams");
  const mk = (id: string, name: string, category: string, price: number) =>
    upsertProduct({ platform: "shopee", externalId: id, name, category, price, discountPct: 0, affiliateUrl: "#" });
  const a = await mk("1", "Tai nghe A", "Điện tử", 90_000);
  await mk("2", "Chuột B", "Điện tử", 450_000);
  await mk("3", "Serum C", "Làm đẹp", 150_000);
  await mk("4", "Nồi D", "Gia dụng", 900_000);

  const names = async (f: Parameters<typeof q.listDeals>[0]) => (await q.listDeals({ ...f, sort: "price" })).items.map((x) => x.name);
  assert.deepEqual(await names({ maxPrice: 99_000 }), ["Tai nghe A"]);
  assert.deepEqual(await names({ categories: ["Điện tử", "Làm đẹp"], excludeIds: [a] }), ["Serum C", "Chuột B"]);
  assert.deepEqual(await names({ keywords: ["serum", "nồi"] }), ["Serum C", "Nồi D"]);

  const f = filterFromParams((k) => ({ collection: "do-cong-nghe-duoi-500k", page: "2" })[k as "page"]);
  assert.equal(f.maxPrice, 500_000);
  assert.deepEqual(f.categories, ["Điện tử"]);
  assert.equal(f.page, 2);

  const byIds = await q.dealsByIds([a, 999, a]);
  assert.deepEqual(byIds.map((x) => x.id), [a]);
});

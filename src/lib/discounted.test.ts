/** "Deal hot": chỉ món đang giảm (giảm thật ≥5%, hoặc mới theo dõi có giá gạch), món không giảm vẫn tìm được */
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "http://test.local";

test("lọc món đang giảm giá", async () => {
  const dbm = await import("./db");
  await dbm.ensureMigrated();
  const { upsertProduct } = await import("./ingest");
  const { listDeals, countDeals } = await import("./queries");
  const { filterFromParams } = await import("./dealParams");
  const day = 86_400_000, now = Date.now();
  const base = { platform: "shopee" as const, discountPct: 0, affiliateUrl: "https://s.shopee.vn/x", rating: 4.9, sold: 2_000_000 };

  // Không giảm (nhập CSV, bán chạy): không vào Deal hot
  await upsertProduct({ ...base, externalId: "1", name: "Kính cường lực", price: 29_900 });
  // Giảm thật: giá 10 ngày trước 200k, nay 150k
  await upsertProduct({ ...base, externalId: "2", name: "Balo cầu lông", price: 200_000 }, new Date(now - 10 * day));
  await upsertProduct({ ...base, externalId: "2", name: "Balo cầu lông", price: 150_000 }, new Date(now));
  // Mới theo dõi, có giá gạch 160k -> 82k
  await upsertProduct({ ...base, externalId: "3", name: "Tất vớ", price: 82_000, originalPrice: 160_000, discountPct: 49 });
  // Theo dõi lâu, giá không đổi mà vẫn gắn giá gạch (giảm ảo): không tính
  await upsertProduct({ ...base, externalId: "4", name: "Nồi chiên", price: 900_000, originalPrice: 1_800_000, discountPct: 50 }, new Date(now - 20 * day));
  await upsertProduct({ ...base, externalId: "4", name: "Nồi chiên", price: 900_000, originalPrice: 1_800_000, discountPct: 50 }, new Date(now));

  const { items } = await listDeals({ discounted: true, pageSize: 50 });
  assert.deepEqual(items.map((p) => p.externalId).sort(), ["2", "3"]);
  assert.equal(await countDeals({ discounted: false }), 4, "bỏ lọc thì thấy mọi món");
  assert.equal(await countDeals({ q: "kính" }), 1, "tìm kiếm vẫn ra món không giảm");
  assert.equal(filterFromParams((k) => (k === "deal" ? "1" : null)).discounted, true, "tải thêm giữ bộ lọc");
  await dbm.closeDb();
});

/** Thay link affiliate hàng loạt cho món Shopee đang dùng link sản phẩm thường */
import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "https://sandealgiare.com";
process.env.SOURCES = "none";

let ingest: typeof import("./ingest");
let al: typeof import("./afflinks");
let ph: typeof import("./producthealth");
let dbm: typeof import("./db");
let schema: typeof import("@/db/schema");

before(async () => {
  dbm = await import("./db");
  await dbm.ensureMigrated();
  ingest = await import("./ingest");
  al = await import("./afflinks");
  ph = await import("./producthealth");
  schema = await import("@/db/schema");
});

test("đọc file kết quả bất kể tên cột: CSV, dán từ Excel, mẫu “Lấy link sản phẩm hàng loạt”", () => {
  const csv = '﻿Link gốc,Link rút gọn,Sub_id\r\n"https://shopee.vn/product/88/7001",https://s.shopee.vn/AbC1,sd\r\nhttps://shopee.vn/Ten-mon-i.88.7002?sp_atk=1,https://s.shopee.vn/AbC2\r\n';
  const paste = "https://s.shopee.vn/AbC3\thttps://shopee.vn/product/88/7003\n\nchỉ có https://s.shopee.vn/AbC4\nhttps://shopee.vn/product/88/7005 không có link affiliate\n";
  const sample = 'Mã sản phẩm,Tên sản phẩm,Giá,Link sản phẩm,Link ưu đãi\n7006,"Ốp lưng, iPhone",25.000,https://shopee.vn/product/88/7006,https://s.shopee.vn/AbC6\n';
  const r = al.parseAffLinks(csv + paste + sample);
  assert.deepEqual(Object.fromEntries(r.pairs), {
    "7001": "https://s.shopee.vn/AbC1",
    "7002": "https://s.shopee.vn/AbC2",
    "7003": "https://s.shopee.vn/AbC3",
    "7006": "https://s.shopee.vn/AbC6",
  });
  assert.equal(r.noOrigin, 1, "dòng chỉ có link rút gọn");
});

test("xuất món chưa có link affiliate, tải kết quả lên thì thay link mua và món ra khỏi danh sách", async () => {
  const now = new Date();
  const add = (id: string, aff: string, extra: Record<string, unknown> = {}) =>
    ingest.upsertProduct({ platform: "shopee", externalId: id, name: `Món ${id}`, price: 50_000, discountPct: 0, affiliateUrl: aff, ...extra }, now);
  const need = await add("8001", "https://shopee.vn/product/99/8001"); // khách góp qua tiện ích
  const hot = await add("8002", "https://shopee.vn/Mon-i.99.8002"); // có người bấm mua -> xuất trước
  await add("8003", "https://s.shopee.vn/ok"); // đã có link affiliate
  const noShop = await add("8004", "https://shopee.vn/product/0/8004"); // không biết mã shop
  const hidden = await add("8005", "https://shopee.vn/product/99/8005");
  await dbm.db.update(schema.products).set({ hidden: true }).where((await import("drizzle-orm")).eq(schema.products.id, hidden));
  await dbm.db.insert(schema.clicks).values({ productId: hot, platform: "shopee" });

  const lazada = await ingest.upsertProduct({ platform: "lazada", externalId: "8006", name: "Món Lazada", price: 1000, discountPct: 0, affiliateUrl: "https://www.lazada.vn/products/i8006.html" }, now);
  const ids = (await ph.healthList({ issue: "no_aff", now })).list.map((r) => r.p.id).sort((a, b) => a - b);
  assert.deepEqual(ids, [need, hot, noShop, hidden].sort((a, b) => a - b), "chỉ món Shopee chưa có link s.shopee.vn");
  assert.ok(!ids.includes(lazada));

  const e = await al.affLinkExport();
  assert.deepEqual(e.rows.map((r) => r.id), [hot, need], "món khách quan tâm trước, bỏ món ẩn");
  assert.equal(e.rows[0].url, "https://shopee.vn/product/99/8002");
  assert.equal(e.noLink, 1);
  assert.equal(al.affExportFile(e, "txt"), "https://shopee.vn/product/99/8002\nhttps://shopee.vn/product/99/8001\n");
  assert.match(al.affExportFile(e, "csv"), /^﻿Link sản phẩm,Tên sản phẩm,Mã Săn Deal\r\n"https:\/\/shopee\.vn\/product\/99\/8002","Món 8002",/);

  const r = await al.applyAffLinks(al.parseAffLinks("https://shopee.vn/product/99/8001,https://s.shopee.vn/New1\nhttps://shopee.vn/product/99/8002,https://s.shopee.vn/New2\nhttps://shopee.vn/product/99/9999,https://s.shopee.vn/X"));
  assert.deepEqual(r, { updated: 2, notFound: 1, noOrigin: 0 });
  const [p] = await dbm.db.select().from(schema.products).where((await import("drizzle-orm")).eq(schema.products.id, need));
  assert.equal(p.affiliateUrl, "https://s.shopee.vn/New1");
  assert.deepEqual((await al.affLinkExport()).rows.map((x) => x.id), [], "đã có link affiliate: không xuất nữa");

  // Lần nhập CSV / tiện ích góp giá sau không ghi đè link affiliate bằng link thường
  const obs = await import("./observe");
  await obs.recordObservation({ url: "https://shopee.vn/product/99/8001", name: "Món 8001", price: 48_000 }, "1.1.1.1", new Date(now.getTime() + 25 * 3_600_000));
  const [p2] = await dbm.db.select().from(schema.products).where((await import("drizzle-orm")).eq(schema.products.id, need));
  assert.equal(p2.affiliateUrl, "https://s.shopee.vn/New1");
});

/** Giá theo phân loại: làm sạch, ghi nhận, chống dữ liệu sai, lịch sử, theo dõi & báo giá theo phân loại */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { eq } from "drizzle-orm";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "http://test.local";
process.env.SMTP_URL = "";
process.env.SOURCES = "mock";

import { cleanVariant } from "./variants";

let dbm: typeof import("./db");
let vmod: typeof import("./variants");
let ingest: typeof import("./ingest");
let auth: typeof import("./auth");
let notify: typeof import("@/worker/notify");
let mail: typeof import("./mail");
let schema: typeof import("@/db/schema");

before(async () => {
  dbm = await import("./db");
  await dbm.ensureMigrated();
  vmod = await import("./variants");
  ingest = await import("./ingest");
  auth = await import("./auth");
  notify = await import("@/worker/notify");
  mail = await import("./mail");
  schema = await import("@/db/schema");
});

const URL = "https://shopee.vn/product/1/550001";
const H = 3_600_000;

test("làm sạch: khoá không phụ thuộc thứ tự nhóm, mã SKU, dữ liệu sai bị loại", () => {
  const a = cleanVariant({ url: URL, groups: [{ group: "Màu", value: "Đen" }, { group: "Size", value: "L" }], price: 120000 })!;
  const b = cleanVariant({ url: URL, groups: [{ group: "Size", value: "L" }, { group: "Màu:", value: "đen" }], price: 120000 })!;
  assert.equal(a.key, b.key);
  assert.equal(a.name, "Màu: Đen · Size: L");
  assert.equal(cleanVariant({ url: "https://www.lazada.vn/products/x-i1234-s99887.html", groups: [{ group: "Color", value: "Red" }], skuId: "99887", price: 50000 })!.key, "sku:99887");
  assert.equal(cleanVariant({ url: URL, groups: [], price: 120000 }), null);
  assert.equal(cleanVariant({ url: URL, groups: [{ value: "Đen" }], price: 10 }), null);
  assert.equal(cleanVariant({ url: "abc", groups: [{ value: "Đen" }], price: 120000 }), null);
  const g = cleanVariant({ url: URL, groups: [{ value: "Đen" }], price: 100000, originalPrice: 99000 })!;
  assert.equal(g.originalPrice, null, "giá gạch nhỏ hơn giá bán bị bỏ");
});

test("ghi nhận giá phân loại: tạo, trùng, đổi giá, giá nhảy cần 2 người, giá vô lý bị loại", async () => {
  const t0 = new Date("2026-09-01T03:00:00Z");
  const at = (h: number) => new Date(t0.getTime() + h * H);
  const pid = await ingest.upsertProduct({ platform: "shopee", externalId: "550001", name: "Áo thun basic", price: 99_000, discountPct: 0, affiliateUrl: "https://e.com" }, t0);
  const den = { url: URL, groups: [{ group: "Màu", value: "Đen" }, { group: "Size", value: "L" }] };

  assert.equal((await vmod.recordVariantPrice({ url: "https://shopee.vn/product/1/999", groups: [{ value: "x" }], price: 100000 }, "1.1.1.1", t0)).status, "unknown");
  assert.equal((await vmod.recordVariantPrice({ ...den, price: 20_000 }, "1.1.1.1", t0)).status, "invalid", "rẻ hơn nửa giá sản phẩm: vô lý");

  const r1 = await vmod.recordVariantPrice({ ...den, price: 129_000, originalPrice: 200_000 }, "1.1.1.1", t0);
  assert.equal(r1.status, "created");
  assert.equal((await vmod.recordVariantPrice({ ...den, price: 129_000 }, "1.1.1.1", at(0.2))).status, "dup", "cùng người trong 30 phút");
  assert.equal((await vmod.recordVariantPrice({ ...den, price: 129_000 }, "2.2.2.2", at(1))).status, "same");
  assert.equal((await vmod.recordVariantPrice({ ...den, price: 119_000 }, "1.1.1.1", at(24))).status, "updated");
  // Giá nhảy > 50%: người thứ nhất chờ, người thứ hai xác nhận
  assert.equal((await vmod.recordVariantPrice({ ...den, price: 299_000 }, "3.3.3.3", at(48))).status, "pending");
  assert.equal((await vmod.recordVariantPrice({ ...den, price: 299_000 }, "4.4.4.4", at(49))).status, "updated");
  assert.equal((await vmod.recordVariantPrice({ ...den, price: 109_000 }, "1.1.1.1", at(50))).status, "pending");

  await vmod.recordVariantPrice({ url: URL, groups: [{ group: "Size", value: "M" }, { group: "Màu", value: "Trắng" }], price: 99_000 }, "1.1.1.1", at(50));
  const rows = await vmod.variantsFor(pid, at(51));
  assert.deepEqual(rows.map((r) => r.name), ["Size: M · Màu: Trắng", "Màu: Đen · Size: L"], "rẻ nhất trước");
  const black = rows[1];
  assert.equal(black.price, 299_000);
  assert.equal(black.low90, 119_000);
  assert.equal(black.history.length, 3);
  assert.equal(black.originalPrice, 200_000);
  assert.equal(black.stale, false);
  assert.equal((await vmod.variantsFor(pid, at(24 * 10)))[1].stale, true, "quá 7 ngày chưa cập nhật");

  const s = await vmod.variantSummary(r1.variantId!, at(51));
  assert.deepEqual([s?.name, s?.low90], ["Màu: Đen · Size: L", 119_000]);
});

test("theo dõi một phân loại: báo theo giá phân loại, không báo khi giá phân loại đã cũ", async () => {
  const { db } = dbm;
  const { users, productVariants, watches } = schema;
  const now = new Date();
  const pid = await ingest.upsertProduct({ platform: "shopee", externalId: "550002", name: "Nồi cơm điện", price: 500_000, discountPct: 0, affiliateUrl: "https://e.com" }, now);
  const url = "https://shopee.vn/product/1/550002";
  const big = await vmod.recordVariantPrice({ url, groups: [{ group: "Dung tích", value: "1.8L" }], price: 800_000 }, "9.9.9.1", now);
  const [u] = await db.insert(users).values({ email: "phan-loai@test.vn" }).returning();
  // Theo dõi bản 1.8L ở mức 700k: giá chung (500k) thấp hơn mức này nhưng không được báo nhầm
  await auth.upsertWatch(u.id, pid, 700_000, big.variantId!);
  const n0 = mail.outbox.length;
  await notify.notifyWatchers(now);
  assert.equal(mail.outbox.slice(n0).filter((m) => m.to === "phan-loai@test.vn").length, 0);

  // Bản 1.8L giảm còn 690k -> báo, nêu đúng tên phân loại
  await vmod.recordVariantPrice({ url, groups: [{ group: "Dung tích", value: "1.8L" }], price: 690_000 }, "9.9.9.2", new Date(now.getTime() + 1000));
  await notify.notifyWatchers(new Date(now.getTime() + 2000));
  const m = mail.outbox.slice(n0).find((x) => x.to === "phan-loai@test.vn");
  assert.ok(m, "có email báo giá");
  assert.match(m!.subject, /1\.8L/);
  assert.match(m!.subject, /690\.000/);

  // Giá phân loại cũ hơn 7 ngày: không dùng để báo
  const [w] = await db.select().from(watches).where(eq(watches.userId, u.id));
  await db.update(watches).set({ lastNotifiedAt: null }).where(eq(watches.id, w.id));
  await db.update(productVariants).set({ lastSeenAt: new Date(now.getTime() - 8 * 86_400_000) }).where(eq(productVariants.id, big.variantId!));
  const n1 = mail.outbox.length;
  await notify.notifyWatchers(new Date(now.getTime() + 3000));
  assert.equal(mail.outbox.slice(n1).filter((x) => x.to === "phan-loai@test.vn").length, 0);

  // Đặt lại theo dõi giá chung: bỏ phân loại
  await auth.upsertWatch(u.id, pid, 450_000, null);
  const [w2] = await db.select().from(watches).where(eq(watches.userId, u.id));
  assert.equal(w2.variantId, null);
});

test("tiện ích: chỉ nhận giá đơn, không nhận khoảng giá", () => {
  const require = createRequire(import.meta.url);
  require("../../extension/extract.js");
  const X = (globalThis as unknown as { SanDealExtract: { singlePrice: (t: string) => number } }).SanDealExtract;
  assert.equal(X.singlePrice("16.000₫"), 16000);
  assert.ok(Number.isNaN(X.singlePrice("14.065₫ - 39.000₫")));
  assert.ok(Number.isNaN(X.singlePrice("Đã bán 2k")));
});

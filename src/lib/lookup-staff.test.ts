/** Quản trị viên dán link ở "Kiểm tra giá": vẫn xếp hàng chờ nhưng không cộng vào số lần khách dán */
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "http://test.local";
process.env.SOURCES = "none";
process.env.MOCK_LOOKUP = "0";

test("số lần dán chỉ tính khách, không tính quản trị viên", async () => {
  const dbm = await import("./db");
  await dbm.ensureMigrated();
  const { checkLink } = await import("./lookup");
  const { productRequests } = await import("@/db/schema");
  const count = async () => (await dbm.db.select({ n: productRequests.count }).from(productRequests))[0]?.n;

  const url = "https://shopee.vn/Noi-chien-khong-dau-i.111.222";
  const a = await checkLink(url, { staff: true });
  assert.equal(a.status, "queued", "quản trị viên dán: vẫn xếp hàng để tiện ích mở");
  assert.equal(await count(), 0);
  await checkLink(url);
  await checkLink(url);
  assert.equal(await count(), 2, "2 lượt khách dán");
  await checkLink(url, { staff: true });
  assert.equal(await count(), 2, "quản trị viên dán thêm: không đổi");
});

/** Doanh thu: kênh khách tới, nhập CSV báo cáo hoa hồng, ghép đơn với lượt bấm, báo cáo */
import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "https://sandealgiare.com";
process.env.SOURCES = "none";

import { channelFromCookie, detectChannel } from "./channel";
import { clickIdFromSubIds, lineStatus, mapConversionCsv, parseMoney, parseVnDate } from "./revenue";

let ingest: typeof import("./ingest");
let rev: typeof import("./revenue");
let dbm: typeof import("./db");
let schema: typeof import("@/db/schema");

before(async () => {
  dbm = await import("./db");
  await dbm.ensureMigrated();
  ingest = await import("./ingest");
  rev = await import("./revenue");
  schema = await import("@/db/schema");
});

const u = (s: string) => new URL(s);
const HOST = "sandealgiare.com";

test("kênh khách tới: utm trước, rồi fbclid, rồi trang giới thiệu; đi trong site thì giữ kênh cũ", () => {
  assert.equal(detectChannel(u("https://sandealgiare.com/product/x-1?utm_source=facebook&utm_medium=social"), null, HOST), "facebook");
  assert.equal(detectChannel(u("https://sandealgiare.com/?utm_source=telegram"), "https://www.google.com/", HOST), "telegram");
  assert.equal(detectChannel(u("https://sandealgiare.com/?fbclid=abc"), null, HOST), "facebook");
  assert.equal(detectChannel(u("https://sandealgiare.com/"), "https://www.google.com.vn/", HOST), "google");
  assert.equal(detectChannel(u("https://sandealgiare.com/"), "https://l.facebook.com/", HOST), "facebook");
  assert.equal(detectChannel(u("https://sandealgiare.com/"), "https://mail.google.com/", HOST), "email");
  assert.equal(detectChannel(u("https://sandealgiare.com/"), "https://voz.vn/t/123", HOST), "other");
  assert.equal(detectChannel(u("https://sandealgiare.com/top"), "https://sandealgiare.com/", HOST), null, "đi trong site");
  assert.equal(detectChannel(u("https://sandealgiare.com/top"), "https://www.sandealgiare.com/", HOST), null);
  assert.equal(detectChannel(u("https://sandealgiare.com/top"), null, HOST), null);
  assert.equal(detectChannel(u("https://sandealgiare.com/?utm_source=lạ"), null, HOST), "other");
  assert.equal(channelFromCookie("a=1; sd_ch=zalo; b=2"), "zalo");
  assert.equal(channelFromCookie("sd_ch=hack"), "direct", "giá trị lạ");
  assert.equal(channelFromCookie(null), "direct");
});

test("đọc số tiền, ngày giờ, trạng thái, mã lượt bấm trong sub_id", () => {
  assert.equal(parseMoney("12.345"), 12345);
  assert.equal(parseMoney("₫1.234.567"), 1234567);
  assert.equal(parseMoney("12,345"), 12345);
  assert.equal(parseMoney("1234.5"), 1234.5);
  assert.equal(parseMoney("1.234,5"), 1234.5);
  assert.equal(parseMoney(""), 0);
  assert.equal(parseVnDate("2026-10-01 12:34:56")?.toISOString(), "2026-10-01T05:34:56.000Z");
  assert.equal(parseVnDate("01/10/2026 07:05")?.toISOString(), "2026-10-01T00:05:00.000Z");
  assert.equal(parseVnDate("--"), null);
  assert.equal(lineStatus("Đã hủy"), "cancelled");
  assert.equal(lineStatus("Hoàn thành"), "completed");
  assert.equal(lineStatus("COMPLETED"), "completed");
  assert.equal(lineStatus("Đang chờ xử lý"), "pending");
  assert.equal(lineStatus("Unpaid"), "pending");
  assert.equal(lineStatus("Không hợp lệ"), "cancelled");
  assert.equal(clickIdFromSubIds("web-c123-x"), 123);
  assert.equal(clickIdFromSubIds("facebook"), null);
  assert.equal(clickIdFromSubIds("abc123"), null);
});

// Tệp mẫu theo kiểu báo cáo của Shopee Affiliate (tiếng Việt)
const CSV = [
  "ID đơn hàng,Trạng thái đặt hàng,ID Checkout,Thời gian đặt hàng,Thời gian hoàn thành,Thời gian Click,Tên Shop,ID Shop,ID sản phẩm,Tên Item,ID Model,Giá(₫),Số lượng,Tổng hoa hồng sản phẩm(₫),Tổng hoa hồng đơn hàng(₫),Trạng thái sản phẩm liên kết,Sub_id1,Sub_id2",
  `A1,Hoàn thành,C1,2026-10-02 10:00:00,2026-10-09 09:00:00,2026-10-02 09:55:00,Shop X,77,1001,"Kem chống nắng, 50ml",9,"150.000",1,"7.500","9.000",Hoàn thành,,`,
  `A1,Hoàn thành,C1,2026-10-02 10:00:00,2026-10-09 09:00:00,2026-10-02 09:55:00,Shop X,77,5555,Món khách mua thêm,,"30.000",2,"1.500","9.000",Hoàn thành,,`,
  `A2,Đang chờ xử lý,C2,2026-10-03 20:00:00,,2026-10-03 19:00:00,Shop Y,88,1002,Nồi chiên,,"1.000.000",1,"30.000","30.000",Đang chờ xử lý,web,c999999`,
  `A3,Đã hủy,C3,2026-10-04 08:00:00,,,Shop Z,99,1003,Tai nghe,,"200.000",1,"10.000","10.000",Đã hủy,,`,
  `,Hoàn thành,,2026-10-04 08:00:00,,,,,,,,,,,,,,`,
].join("\n");

test("đọc tệp CSV báo cáo hoa hồng: nhận cột tiếng Việt, gộp theo đơn, dùng hoa hồng từng sản phẩm", () => {
  const r = mapConversionCsv(CSV);
  assert.equal(r.commissionColumn, "item");
  assert.equal(r.orders.length, 3);
  assert.equal(r.lines, 4);
  assert.equal(r.skipped.length, 1);
  const a1 = r.orders.find((o) => o.orderId === "A1")!;
  assert.equal(a1.lines.length, 2);
  assert.equal(a1.lines[0].lineKey, "1001:9");
  assert.equal(a1.lines[0].itemName, "Kem chống nắng, 50ml");
  assert.equal(a1.lines[0].commission, 7500);
  assert.equal(a1.lines[1].qty, 2);
  assert.equal(a1.lines[0].status, "completed");
  assert.equal(a1.lines[0].completedAt?.toISOString(), "2026-10-09T02:00:00.000Z");
  assert.equal(r.orders.find((o) => o.orderId === "A2")!.lines[0].subIds, "web-c999999");
  assert.equal(r.orders.find((o) => o.orderId === "A3")!.lines[0].status, "cancelled");
  // Chỉ có cột hoa hồng cả đơn: tính 1 lần mỗi đơn
  const orderOnly = CSV.replace("Tổng hoa hồng sản phẩm(₫)", "Cột khác");
  const r2 = mapConversionCsv(orderOnly);
  assert.equal(r2.commissionColumn, "order");
  assert.equal(r2.orders.find((o) => o.orderId === "A1")!.lines.reduce((s, l) => s + l.commission, 0), 9000);
  assert.match(mapConversionCsv("a,b\n1,2").skipped[0].reason, /mã đơn/);
});

test("nhập CSV: ghép đơn với món và lượt bấm, nhập lại không cộng trùng, báo cáo tách trạng thái và kênh", async () => {
  const at = (s: string) => new Date(`${s}+07:00`);
  const pid = await ingest.upsertProduct({ platform: "shopee", externalId: "1001", name: "Kem chống nắng 50ml", price: 150_000, discountPct: 0, affiliateUrl: "https://s.shopee.vn/a", category: "Sắc Đẹp" }, at("2026-10-01T00:00:00"));
  const pid2 = await ingest.upsertProduct({ platform: "shopee", externalId: "1002", name: "Nồi chiên không dầu", price: 1_000_000, discountPct: 0, affiliateUrl: "https://s.shopee.vn/b", category: "Thiết Bị Điện Gia Dụng" }, at("2026-10-01T00:00:00"));
  const { clicks, conversionItems } = schema;
  await dbm.db.insert(clicks).values([
    { productId: pid, platform: "shopee", channel: "facebook", createdAt: at("2026-10-02T09:55:10") },
    { productId: pid2, platform: "shopee", channel: "google", createdAt: at("2026-09-20T10:00:00") }, // quá 7 ngày
    { productId: null, voucherId: null, platform: "shopee", channel: "zalo", createdAt: at("2026-10-03T18:00:00") },
  ]);

  const now = at("2026-10-10T12:00:00");
  const r = await rev.importConversionCsv(CSV, now);
  assert.equal(r.orders, 3);
  assert.equal(r.lines, 4);
  const rows = await dbm.db.select().from(conversionItems);
  const by = (k: string) => rows.find((x) => x.lineKey === k)!;
  assert.deepEqual([by("1001:9").productId, by("1001:9").attribution, by("1001:9").channel], [pid, "exact", "facebook"]);
  assert.deepEqual([by("5555").productId, by("5555").attribution, by("5555").channel], [null, "cart", "facebook"], "món ngoài danh sách: mua thêm sau lượt bấm");
  assert.deepEqual([by("1002").productId, by("1002").attribution, by("1002").channel], [pid2, "cart", "zalo"], "lượt bấm món này quá 7 ngày: lấy lượt bấm cùng sàn gần nhất");

  // Nhập lại (đơn A2 đã hoàn thành): cập nhật, không cộng trùng
  await rev.importConversionCsv(CSV.replace(/Đang chờ xử lý/g, "Hoàn thành"), now);
  assert.equal((await dbm.db.select().from(conversionItems)).length, 4);

  const rep = await rev.revenueReport(at("2026-10-01T00:00:00"), at("2026-11-01T00:00:00"), now);
  assert.equal(rep.totals.orders, 3);
  assert.equal(rep.totals.completed, 7500 + 1500 + 30_000);
  assert.equal(rep.totals.pending, 0);
  assert.equal(rep.totals.cancelled, 10_000);
  assert.equal(rep.totals.amount, 150_000 + 60_000 + 1_000_000, "doanh số bỏ dòng bị huỷ");
  assert.equal(rep.cancel.fromData, false, "chưa đủ đơn để tính tỉ lệ huỷ");
  assert.equal(rep.expected, 39_000);
  const ch = Object.fromEntries(rep.byChannel.map((c) => [c.channel, c]));
  assert.equal(ch.facebook.commission, 9000);
  assert.equal(ch.facebook.clicks, 1);
  assert.equal(ch.zalo.commission, 30_000);
  assert.equal(rep.topProducts[0].productId, pid2);
  assert.equal(rep.topProducts.find((x) => x.itemId === "5555")?.tracked, false);
  assert.equal(rep.byCategory[0].category, "Thiết Bị Điện Gia Dụng");
  assert.equal(rep.months[0].month, "2026-10");
  assert.equal(rep.months[0].completedInMonth, 7500 + 1500, "chỉ đơn có ngày hoàn thành");

  // API cơ bản (không mã sản phẩm) không ghi đè dữ liệu chi tiết của CSV
  await rev.saveOrders("api", [{ platform: "shopee", orderId: "A1", lines: [{ lineKey: "#1", price: 210_000, qty: 1, commission: 9000, status: "pending", purchasedAt: at("2026-10-02T10:00:00") }] }], now);
  assert.equal((await dbm.db.select().from(conversionItems)).filter((x) => x.orderId === "A1").length, 2);
});

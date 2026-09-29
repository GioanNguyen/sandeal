import { test } from "node:test";
import assert from "node:assert/strict";
import { exactPrice, mapShopeeCsv, mergeExisting, parseCsv, parsePercent, parseVnNumber } from "./shopee-csv";
import type { Product } from "@/db/schema";

const CSV = `﻿Mã sản phẩm,Tên sản phẩm,Giá,Doanh thu,Tên cửa hàng,Tỉ lệ hoa hồng,Hoa hồng,Link sản phẩm,Link ưu đãi
2608753400,Kính Cường Lực iPhone KK 4D,"29,9k",2tr+,SHIN CASE,"24,5%",₫7.176,https://shopee.vn/product/89827191/2608753400,https://s.shopee.vn/9zy6lfP0RQ\r
28407466123,"Vợt pickleball Facolos, 16mm","1,1tr",6k+,Facolos Pickleball,13%,₫140.270,https://shopee.vn/product/1286901283/28407466123,https://s.shopee.vn/5q8Xo0ertj
27607552644,Balo cầu lông NATOLI,"509,0k",10k+,Natoli Official Store,15%,₫76.350,https://shopee.vn/product/515748887/27607552644,
,Thiếu mã,"10k",,,,,,
`;

test("CSV: ngoặc kép, dấu phẩy trong ô, CRLF, BOM", () => {
  const rows = parseCsv(CSV);
  assert.equal(rows.length, 5);
  assert.equal(rows[0][0], "Mã sản phẩm");
  assert.equal(rows[2][1], "Vợt pickleball Facolos, 16mm");
  assert.equal(rows[1][8], "https://s.shopee.vn/9zy6lfP0RQ");
});

test("số kiểu Shopee", () => {
  assert.deepEqual(parseVnNumber("29,9k"), { value: 29_900, step: 100 });
  assert.deepEqual(parseVnNumber("1,1tr"), { value: 1_100_000, step: 100_000 });
  assert.equal(parseVnNumber("₫7.176")?.value, 7_176);
  assert.equal(parseVnNumber("2tr+")?.value, 2_000_000);
  assert.equal(parseVnNumber("100k+")?.value, 100_000);
  assert.equal(parseVnNumber("abc"), null);
  assert.equal(parsePercent("24,5%"), 0.245);
  assert.equal(parsePercent("13%"), 0.13);
});

test("giá rút gọn: dùng hoa hồng/tỉ lệ khi khớp", () => {
  assert.equal(exactPrice({ value: 1_100_000, step: 100_000 }, 140_270, 0.13), 1_079_000);
  assert.equal(exactPrice({ value: 3_000_000, step: 100_000 }, 358_800, 0.12), 2_990_000);
  // Không khớp (hoa hồng tính trên giá khác) -> giữ giá hiển thị
  assert.equal(exactPrice({ value: 29_900, step: 100 }, 7_176, 0.245), 29_900);
});

test("map file CSV Shopee Affiliate", () => {
  const { items, skipped } = mapShopeeCsv(CSV);
  assert.equal(items.length, 3);
  assert.equal(skipped.length, 1);
  const [a, b, c] = items;
  assert.equal(a.externalId, "2608753400");
  assert.equal(a.affiliateUrl, "https://s.shopee.vn/9zy6lfP0RQ");
  assert.equal(a.commissionRate, 0.245);
  assert.equal(a.sold, 2_000_000);
  assert.equal(b.price, 1_079_000);
  assert.equal(c.price, 509_000);
  // Không có link ưu đãi -> link sản phẩm
  assert.equal(c.affiliateUrl, "https://shopee.vn/product/515748887/27607552644");
  assert.throws(() => mapShopeeCsv("a,b\n1,2"), /Không đúng mẫu/);
});

test("giữ ảnh, giá gốc… của món đã có", () => {
  const { items } = mapShopeeCsv(CSV);
  const e = { imageUrl: "https://down-vn.img.susercontent.com/file/x", originalPrice: 40_000, category: "Phụ kiện", rating: 4.8 } as Product;
  const m = mergeExisting(items[0], e);
  assert.equal(m.imageUrl, e.imageUrl);
  assert.equal(m.category, "Phụ kiện");
  assert.equal(m.discountPct, 25);
  assert.equal(mergeExisting(items[0], { ...e, originalPrice: 20_000 }).discountPct, 0);
});

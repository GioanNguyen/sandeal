import { test } from "node:test";
import assert from "node:assert/strict";
import { groupItems, similarity, tokens } from "./match";

test("chuẩn hoá tên", () => {
  assert.deepEqual(tokens("Nồi chiên không dầu 6 L (Chính hãng) FREESHIP"), ["noi", "chien", "khong", "dau", "6l"]);
  assert.ok(tokens("Sạc dự phòng 20.000mAh").includes("20.000mah") || tokens("Sạc dự phòng 20000 mAh").includes("20000mah"));
});

test("khác thông số thì không ghép", () => {
  assert.equal(similarity(tokens("Nồi chiên không dầu 6L"), tokens("Nồi chiên không dầu 4L")), 0);
  assert.ok(similarity(tokens("Nồi chiên không dầu 6 lít"), tokens("Nồi chiên KHÔNG DẦU 6L chính hãng")) >= 0.6);
});

test("gom nhóm khác sàn", () => {
  const g = groupItems([
    { id: 1, platform: "shopee", name: "Tai nghe Bluetooth chống ồn ANC" },
    { id: 2, platform: "lazada", name: "Tai nghe bluetooth chống ồn ANC chính hãng" },
    { id: 3, platform: "tiktok", name: "Tai nghe Bluetooth chống ồn ANC" },
    { id: 4, platform: "shopee", name: "Nồi chiên không dầu 6L" },
    { id: 5, platform: "shopee", name: "Tai nghe Bluetooth chống ồn ANC" }, // cùng sàn, chưa có bạn khác sàn riêng
    { id: 6, platform: "lazada", name: "Bàn phím cơ không dây" },
  ]);
  assert.equal(g.get(1), "g1");
  assert.equal(g.get(2), "g1");
  assert.equal(g.get(3), "g1");
  assert.equal(g.get(4), undefined);
  assert.equal(g.get(6), undefined);
});

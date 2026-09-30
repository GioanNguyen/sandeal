import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUnit, unitPrice, unitPriceText } from "./unitprice";

const txt = (name: string, price: number) => {
  const u = unitPrice(name, price);
  return u ? `${unitPriceText(u)} (${u.qtyText})` : null;
};

test("giá theo đơn vị từ tên thật trong file CSV", () => {
  assert.equal(txt("Nước giặt D-nee cho trẻ sơ sinh - Can 3000ml - 4 Hương thơm", 263_100), "≈ 87.700đ/lít (3 lít)");
  assert.equal(txt("Combo 10 đôi tất nam Zara Men cổ ngắn siêu thoáng mát", 23_700), "≈ 2.400đ/đôi (10 đôi)");
  assert.equal(txt("(Túi 20 miếng) Miếng dán giảm đau ngải cứu", 13_000), "≈ 650đ/miếng (20 miếng)");
  assert.equal(txt("Combo 5 quần lót nam FAPAP trơn chất thun lạnh co giãn 4 chiều", 102_900), "≈ 20.600đ/món (5 món)");
  assert.equal(txt("Bánh Tráng TRỘN HÀNH PHI GẤP ĐÔI AVAGI COMBO 2 Hũ 600Gr", 42_000), "≈ 21.000đ/hũ (2 hũ)", "không rõ 600g là mỗi hũ hay tổng");
  // Không chắc -> không hiện
  assert.equal(txt("Combo 3,4,5 quần sịp nam boxer hoạ tiết rồng", 112_000), null);
  assert.equal(txt("Quả tạ 10kg 20kg 30kg 40kg,Bộ tạ kèm tạ", 459_000), null);
  assert.equal(txt("Kính Cường Lực iPhone KK 4D Cao Cấp Full Màn iPhone 6/6s/7/8", 29_900), null);
  assert.equal(txt("Vợt pickleball Facolos Colorful 16mm điểm chạm lớn", 1_079_000), null);
  assert.equal(txt("Máy chạy bộ tại nhà MY-HI B40, 1-16km/h", 2_990_000), null);
  assert.equal(txt("Thùng 10 bịch khăn giấy rút Top Gia 1280 tờ", 139_000), null);
  assert.equal(txt("Điện thoại Samsung Galaxy A55 5G 128GB", 8_990_000), null);
});

test("dạng khác", () => {
  assert.equal(txt("Sữa tắm Dove 500ml", 120_000), "≈ 24.000đ/100ml (500ml)");
  assert.equal(txt("Nước giặt Omo 3,8kg", 190_000), "≈ 50.000đ/kg (3,8kg)");
  assert.equal(txt("Sữa tươi TH 180ml x 48", 480_000), "≈ 55.600đ/lít (8,64 lít)");
  assert.equal(txt("Dầu ăn Simply 1,5L", 90_000), "≈ 60.000đ/lít (1,5 lít)");
  assert.equal(parseUnit("Tủ lạnh 180L"), null, "dung tích tủ không phải lượng hàng");
  assert.equal(txt("Khăn giấy 1 cuộn", 10_000), null, "1 cái: không có ích");
  assert.equal(txt("Serum Vitamin C 30ml", 281_000), "≈ 9.400đ/ml (30ml)");
  // Dung tích / tải trọng của đồ đựng, thiết bị: không phải lượng hàng
  assert.equal(txt("Bình giữ nhiệt 750ml", 216_000), null);
  assert.equal(txt("Nồi chiên không dầu cỡ lớn 8L", 1_089_000), null);
  assert.equal(txt("Máy giặt cửa trước 9kg", 7_990_000), null);
  assert.equal(txt("Cân điện tử nhà bếp 5kg", 99_000), null);
  assert.equal(txt("Ly thủy tinh 350ml combo 6 cái", 120_000), "≈ 20.000đ/cái (6 cái)", "đồ đựng vẫn tính theo cái");
});

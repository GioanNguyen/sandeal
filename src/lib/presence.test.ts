import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { _resetPresence, cleanPath, leavePresence, ONLINE_MS, onlineNow, sourceOf, touchPresence } from "./presence";

beforeEach(() => _resetPresence());
const info = (path: string, extra: Partial<Parameters<typeof touchPresence>[1]> = {}) => ({ path, title: path, device: "mobile" as const, source: "trực tiếp", ...extra });

test("đếm người đang online theo trang; quá hạn hoặc rời trang thì không tính", () => {
  const t = 1_000_000;
  touchPresence("a", info("/product/quat-1"), t);
  touchPresence("b", info("/product/quat-1", { device: "desktop" }), t);
  touchPresence("c", info("/"), t);
  touchPresence("d", info("/sale/11-11"), t - ONLINE_MS - 1); // báo lần cuối quá 75 giây
  const s = onlineNow(t + 1000);
  assert.equal(s.total, 3);
  assert.equal(s.mobile, 2);
  assert.equal(s.desktop, 1);
  assert.deepEqual(s.pages.map((p) => [p.path, p.n]), [["/product/quat-1", 2], ["/", 1]]);
  leavePresence("a");
  assert.equal(onlineNow(t + 2000).total, 2);
  // Chuyển trang: 1 người chỉ ở 1 trang
  touchPresence("b", info("/"), t + 3000);
  assert.deepEqual(onlineNow(t + 3000).pages.map((p) => [p.path, p.n]), [["/", 2]]);
});

test("nguồn tới giữ theo lần vào site, chuyển trang trong site không đổi thành trực tiếp", () => {
  touchPresence("a", info("/", { source: "Facebook" }), 1000);
  touchPresence("a", info("/product/x", { source: "trực tiếp" }), 2000);
  assert.deepEqual(onlineNow(2000).sources, [{ source: "Facebook", n: 1 }]);
});

test("đường dẫn và nguồn tới được làm gọn", () => {
  assert.equal(cleanPath("/product/quat-1?utm_source=fb&fbclid=x&phanloai=3#theo-doi"), "/product/quat-1?phanloai=3");
  assert.equal(cleanPath("/?q=t%E1%BA%A1i+nghe"), "/?q=tại+nghe");
  assert.equal(cleanPath("https://evil.com/x"), null);
  assert.equal(cleanPath("//evil.com"), null);
  assert.equal(sourceOf("https://www.google.com/"), "Google");
  assert.equal(sourceOf("https://l.facebook.com/l.php?u=x"), "Facebook");
  assert.equal(sourceOf("https://sandealgiare.com/", "sandealgiare.com"), "trực tiếp");
  assert.equal(sourceOf(""), "trực tiếp");
});

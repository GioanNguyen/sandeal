/**
 * Chế độ "Cập nhật hàng loạt" (chỉ quản trị viên): mở lần lượt từng món thiếu ảnh hoặc giá đã cũ (món khách đang
 * quan tâm) trong 1 tab phụ, đọc dữ liệu
 * công khai của trang (như Góp giá) rồi gửi về máy chủ. Chạy chậm như người thật để không bị sàn giới hạn:
 *   - mỗi món cách nhau ngẫu nhiên 30–60 giây (đồng hồ của Chrome không cho ngắn hơn 30 giây)
 *   - tối đa 80 món / giờ, 300 món / ngày
 *   - gặp trang xác minh (captcha) hoặc bắt đăng nhập: dừng ngay, để người dùng tự xử lý rồi bấm Tiếp tục
 * Luôn mở link sản phẩm thường (không phải link affiliate) để không tạo lượt bấm ảo.
 */
const BATCH = {
  minDelay: 30_000,
  maxDelay: 60_000,
  perHour: 80,
  perDay: 300,
  pageTimeout: 45_000,
  fetchSize: 20,
};
const KEY = "batch";
const vnDay = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

async function loadBatch() {
  const { [KEY]: s } = await chrome.storage.local.get(KEY);
  return s || { running: false, tabId: null, current: null, queue: [], ok: 0, fail: 0, hour: [], day: { key: vnDay(), n: 0 }, status: "Chưa chạy", remaining: null };
}
async function saveBatch(s) {
  await chrome.storage.local.set({ [KEY]: s });
}

async function queueFetch(limit) {
  const base = await self.sanDealServer();
  const res = await fetch(`${base}/api/ext/queue?limit=${limit}`, { credentials: "include", cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
async function queueTried(id) {
  const base = await self.sanDealServer();
  await fetch(`${base}/api/ext/queue`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tried: [id] }) }).catch(() => null);
}

/** Trình duyệt này đang đăng nhập tài khoản quản trị trên web Săn Deal? */
let adminCache = null;
async function isAdminBrowser() {
  // Là quản trị viên: nhớ 10 phút; chưa phải (hoặc chưa đăng nhập): hỏi lại sau 1 phút
  if (adminCache && Date.now() - adminCache.at < (adminCache.v ? 10 * 60_000 : 60_000)) return adminCache.v;
  let v = false;
  try {
    const base = await self.sanDealServer();
    const res = await fetch(`${base}/api/ext/queue?check=1`, { credentials: "include", cache: "no-store" });
    v = res.ok && (await res.json().catch(() => ({}))).admin === true;
  } catch (e) {}
  adminCache = { at: Date.now(), v };
  return v;
}

function schedule(ms) {
  chrome.alarms.create("batch-next", { when: Date.now() + ms });
}
const randomDelay = () => BATCH.minDelay + Math.random() * (BATCH.maxDelay - BATCH.minDelay);

async function stopBatch(status) {
  const s = await loadBatch();
  s.running = false;
  s.current = null;
  s.status = status;
  await saveBatch(s);
  chrome.alarms.clear("batch-next");
  chrome.alarms.clear("batch-timeout");
}

async function startBatch() {
  const s = await loadBatch();
  // Kiểm tra quyền quản trị + lấy hàng đợi trước khi mở tab
  const q = await queueFetch(BATCH.fetchSize);
  s.queue = q.items;
  s.remaining = q.remaining;
  s.counts = q.counts || null;
  if (!s.queue.length) {
    s.status = "Không còn món nào thiếu ảnh hay giá cũ (có link sản phẩm)";
    await saveBatch(s);
    return s;
  }
  s.running = true;
  s.status = "Đang chạy";
  if (s.day.key !== vnDay()) s.day = { key: vnDay(), n: 0 };
  await saveBatch(s);
  schedule(1000);
  return s;
}

async function ensureTab(s, url) {
  if (s.tabId != null) {
    const t = await chrome.tabs.get(s.tabId).catch(() => null);
    if (t) {
      await chrome.tabs.update(s.tabId, { url });
      return s.tabId;
    }
  }
  const t = await chrome.tabs.create({ url, active: false });
  return t.id;
}

async function nextItem() {
  const s = await loadBatch();
  if (!s.running) return;
  const now = Date.now();
  s.hour = s.hour.filter((t) => now - t < 3_600_000);
  if (s.day.key !== vnDay()) s.day = { key: vnDay(), n: 0 };
  if (s.day.n >= BATCH.perDay) return stopBatch(`Đã đủ ${BATCH.perDay} món hôm nay – mai chạy tiếp để an toàn`);
  if (s.hour.length >= BATCH.perHour) {
    const wait = 3_600_000 - (now - s.hour[0]) + 5_000;
    s.status = `Nghỉ ${Math.ceil(wait / 60_000)} phút (đã đủ ${BATCH.perHour} món trong 1 giờ)`;
    await saveBatch(s);
    return schedule(wait);
  }
  if (!s.queue.length) {
    try {
      const q = await queueFetch(BATCH.fetchSize);
      s.queue = q.items;
      s.remaining = q.remaining;
      s.counts = q.counts || null;
    } catch (e) {
      return stopBatch(`Dừng: ${e.message || e}`);
    }
    if (!s.queue.length) return stopBatch("Xong – không còn món nào thiếu ảnh hay giá cũ (có link sản phẩm)");
  }
  const item = s.queue.shift();
  s.current = { ...item, startedAt: now };
  s.status = `Đang mở (${item.reason === "price" ? `giá cũ ${item.staleDays ?? "?"} ngày` : "thiếu ảnh"}): ${item.name.slice(0, 60)}`;
  s.tabId = await ensureTab(s, item.url);
  await saveBatch(s);
  chrome.alarms.create("batch-timeout", { when: now + BATCH.pageTimeout });
}

/** Kết quả từ trang (content.js) hoặc hết giờ chờ */
async function finishItem(result) {
  const s = await loadBatch();
  if (!s.running || !s.current) return;
  chrome.alarms.clear("batch-timeout");
  const item = s.current;
  s.current = null;
  if (result.blocked) {
    await saveBatch(s);
    return stopBatch("Tạm dừng: Shopee yêu cầu xác minh hoặc đăng nhập. Mở tab Săn Deal đang chạy, xác minh xong rồi bấm Tiếp tục (nên đợi vài giờ).");
  }
  let ok = false;
  if (result.data && result.data.price > 0) {
    const r = await observe({ url: result.url || item.url, ...result.data }).catch(() => null);
    ok = !!r && r.status !== "invalid" && r.status !== "error";
  }
  ok ? s.ok++ : s.fail++;
  s.hour.push(Date.now());
  s.day.n++;
  if (s.remaining) s.remaining = Math.max(0, s.remaining - (ok ? 1 : 0));
  s.status = ok ? `Đã cập nhật: ${item.name.slice(0, 60)}` : `Không đọc được: ${item.name.slice(0, 60)}`;
  await saveBatch(s);
  queueTried(item.id);
  schedule(randomDelay());
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "batch-next") nextItem();
  if (a.name === "batch-timeout") finishItem({ data: null });
});
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const s = await loadBatch();
  if (s.tabId === tabId) {
    s.tabId = null;
    await saveBatch(s);
    if (s.running) stopBatch("Đã dừng vì tab đang chạy bị đóng");
  }
});

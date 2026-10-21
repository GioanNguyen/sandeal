/**
 * Chế độ "Cập nhật hàng loạt" (chỉ quản trị viên): mở lần lượt link khách hỏi chưa có dữ liệu, món thiếu ảnh hoặc giá
 * đã cũ (món khách đang quan tâm) trong 1 tab phụ, đọc dữ liệu
 * công khai của trang (như Góp giá) rồi gửi về máy chủ. Chạy chậm như người thật để không bị sàn giới hạn:
 *   - mỗi món cách nhau ngẫu nhiên 30–60 giây (đồng hồ của Chrome không cho ngắn hơn 30 giây)
 *   - tối đa 80 món / giờ (đủ thì nghỉ rồi tự chạy tiếp), không giới hạn số món trong ngày
 *   - gặp trang xác minh (captcha) hoặc bắt đăng nhập: dừng ngay, để người dùng tự xử lý rồi bấm Tiếp tục
 * Mở link sản phẩm thường (không phải link affiliate) để không tạo lượt bấm ảo. Riêng món chưa biết link sản phẩm
 * (nhập CSV chỉ có link rút gọn s.shopee.vn) thì mở link rút gọn một lần: Shopee tự chuyển tới trang sản phẩm, web lưu
 * lại link đó cho món, các lần sau mở thẳng link sản phẩm.
 * Trang báo "Sản phẩm này không tồn tại": web ẩn món (lý do "link không còn trên sàn"), không xoá lịch sử giá.
 * Trang danh sách (tìm kiếm theo từ khoá khách cần, loại hàng được quan tâm, Flash Sale): cuộn hết trang, đọc mọi ô sản
 * phẩm – món đã có cập nhật giá, món mới được thêm (1 trang ≈ 40–60 món).
 */
const BATCH = {
  minDelay: 30_000,
  maxDelay: 60_000,
  perHour: 80,
  /** 0 = không giới hạn số món trong ngày */
  perDay: 0,
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

/** Chế độ chạy (chọn trong khung tiện ích): all | items (chỉ món thiếu ảnh, giá cũ, link khách hỏi) | lists (chỉ trang danh sách) */
async function queueFetch(limit, mode = "all") {
  const base = await self.sanDealServer();
  const res = await fetch(`${base}/api/ext/queue?limit=${limit}&mode=${encodeURIComponent(mode)}`, { credentials: "include", cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
/** Gửi các ô sản phẩm đọc được trên 1 trang danh sách (tìm kiếm / danh mục / Flash Sale); key: trang trong hàng đợi quét */
async function sendListing(items, extra = {}) {
  const base = await self.sanDealServer();
  const res = await fetch(`${base}/api/ext/listing`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items, ...extra }) }).catch(() => null);
  return res && res.ok ? res.json().catch(() => null) : null;
}

/** Trang sản phẩm báo "không tồn tại": máy chủ ẩn món (không xoá dữ liệu; nhập lại mà sàn còn bán thì tự hiện lại) */
async function queueDead(id) {
  const base = await self.sanDealServer();
  const res = await fetch(`${base}/api/ext/queue`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dead: id }) }).catch(() => null);
  const j = res && res.ok ? await res.json().catch(() => ({})) : {};
  return j.dead || null;
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

/** Số món còn lại – hỏi máy chủ mỗi lần mở khung tiện ích (không dùng số lưu tạm, vì vừa nhập CSV là số đổi) */
async function queueCounts() {
  const base = await self.sanDealServer();
  const res = await fetch(`${base}/api/ext/queue?counts=1`, { credentials: "include", cache: "no-store" });
  if (!res.ok) return null;
  return res.json().catch(() => null);
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

/** Tên chế độ chạy (hiện trong trạng thái) */
const MODE_LABEL = { all: "cả hai", items: "món lẻ", lists: "trang danh sách", image: "thiếu ảnh", price: "giá cũ", request: "link khách hỏi" };

async function startBatch(mode) {
  const s = await loadBatch();
  if (["all", "items", "lists", "image", "price", "request"].includes(mode)) {
    // Đổi chế độ: bỏ hàng đợi cũ (có thể toàn trang danh sách) để lấy lại theo chế độ mới
    if (s.mode !== mode) s.queue = [];
    s.mode = mode;
  }
  // Kiểm tra quyền quản trị + lấy hàng đợi trước khi mở tab
  const q = await queueFetch(BATCH.fetchSize, s.mode || "all");
  s.queue = q.items;
  s.remaining = q.remaining;
  s.counts = q.counts || null;
  if (!s.queue.length) {
    s.status = `Không còn gì để mở (${MODE_LABEL[s.mode] || "cả hai"})`;
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

/**
 * Mở url trong tab chạy hàng loạt. Ghi trạng thái (mã tab, món đang mở) TRƯỚC khi chuyển trang: trang tải nhanh sẽ hỏi
 * "có phải tab đang chạy không" ngay – nếu chưa ghi kịp, trang tưởng là tab thường và không gửi kết quả.
 */
async function ensureTab(s, url) {
  if (s.tabId != null) {
    const t = await chrome.tabs.get(s.tabId).catch(() => null);
    if (t) {
      await saveBatch(s);
      await chrome.tabs.update(s.tabId, { url });
      return s.tabId;
    }
  }
  const t = await chrome.tabs.create({ url: "about:blank", active: false });
  s.tabId = t.id;
  await saveBatch(s);
  await chrome.tabs.update(t.id, { url });
  return t.id;
}

async function nextItem() {
  const s = await loadBatch();
  if (!s.running) return;
  const now = Date.now();
  s.hour = s.hour.filter((t) => now - t < 3_600_000);
  if (s.day.key !== vnDay()) s.day = { key: vnDay(), n: 0 };
  if (BATCH.perDay && s.day.n >= BATCH.perDay) return stopBatch(`Đã đủ ${BATCH.perDay} món hôm nay – mai chạy tiếp để an toàn`);
  if (s.hour.length >= BATCH.perHour) {
    const wait = 3_600_000 - (now - s.hour[0]) + 5_000;
    s.status = `Nghỉ ${Math.ceil(wait / 60_000)} phút (đã đủ ${BATCH.perHour} món trong 1 giờ)`;
    await saveBatch(s);
    return schedule(wait);
  }
  if (!s.queue.length) {
    try {
      const q = await queueFetch(BATCH.fetchSize, s.mode || "all");
      s.queue = q.items;
      s.remaining = q.remaining;
      s.counts = q.counts || null;
    } catch (e) {
      return stopBatch(`Dừng: ${e.message || e}`);
    }
    if (!s.queue.length) return stopBatch(`Xong – không còn gì để mở (${MODE_LABEL[s.mode] || "cả hai"})`);
  }
  const item = s.queue.shift();
  s.current = { ...item, startedAt: now };
  const why = item.reason === "listing" ? "trang danh sách" : item.reason === "price" ? `giá cũ ${item.staleDays ?? "?"} ngày` : item.reason === "request" ? "link khách hỏi" : "thiếu ảnh";
  s.status = `Đang mở (${why}${item.viaAffiliate ? ", chưa có link sản phẩm – mở link rút gọn" : ""}): ${item.name.slice(0, 60)}`;
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
  if (item.listKey) {
    const items = Array.isArray(result.listing) ? result.listing : [];
    const r = await sendListing(items, { key: item.listKey });
    s.hour.push(Date.now());
    s.day.n++;
    if (r) {
      s.ok += r.created + r.updated;
      s.listCreated = (s.listCreated || 0) + r.created;
      s.status = `Đã đọc ${item.name}: ${items.length} món (${r.created} mới, ${r.updated} cập nhật giá${r.skipped ? `, ${r.skipped} món chưa có trên web – bỏ qua` : ""})`;
    } else {
      s.fail++;
      s.status = `Không đọc được ${item.name}`;
    }
    await saveBatch(s);
    return schedule(randomDelay());
  }
  if (result.dead && item.id > 0) {
    const r = await queueDead(item.id);
    s.dead = (s.dead || 0) + (r === "hidden" ? 1 : 0);
    s.hour.push(Date.now());
    s.day.n++;
    s.status = r === "hidden" ? `Link không còn trên sàn – đã ẩn: ${item.name.slice(0, 60)}` : r === "fresh" ? `Trang báo không tồn tại nhưng nguồn chính thức vừa thấy món – giữ nguyên: ${item.name.slice(0, 50)}` : `Link không còn trên sàn: ${item.name.slice(0, 60)}`;
    await saveBatch(s);
    queueTried(item.id);
    return schedule(randomDelay());
  }
  let ok = false;
  let st = null;
  if (result.data && result.data.price > 0) {
    const r = await observe({ url: result.url || item.url, ...result.data }).catch(() => null);
    st = r && r.status;
    ok = !!r && r.status !== "invalid" && r.status !== "error";
  }
  ok ? s.ok++ : s.fail++;
  s.hour.push(Date.now());
  s.day.n++;
  if (s.remaining) s.remaining = Math.max(0, s.remaining - (ok ? 1 : 0));
  // Nói đúng kết quả: chỉ "created"/"updated" mới đổi giá trên web
  const nm = item.name.slice(0, 60);
  s.status = !ok
    ? `Không đọc được: ${nm}`
    : st === "pending"
      ? `Giá lệch nhiều so với giá đang lưu – chờ xác nhận, chưa đổi: ${nm}`
      : st === "dup"
        ? `Vừa ghi giá món này trong 30 phút – bỏ qua: ${nm}`
        : st === "ignored"
          ? `Nguồn chính thức vừa cập nhật – giữ nguyên: ${nm}`
          : `Đã cập nhật${item.viaAffiliate ? " (đã lưu link sản phẩm)" : ""}: ${nm}`;
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

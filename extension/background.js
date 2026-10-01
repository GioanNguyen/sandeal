importScripts("config.js");

const cache = new Map(); // url -> { at, data }
const TTL = 10 * 60 * 1000;

async function server() {
  const { server } = await chrome.storage.sync.get("server");
  return (server || self.SAN_DEAL_DEFAULT_SERVER).replace(/\/$/, "");
}

async function lookup(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const base = await server();
  // Bộ nhớ tạm của trình duyệt có thể trả câu trả lời cũ (vd "chưa theo dõi" ngay sau khi vừa góp giá):
  // tiện ích đã tự giữ bản tạm 10 phút ở trên nên luôn hỏi thẳng máy chủ.
  const res = await fetch(`${base}/api/ext/lookup?url=${encodeURIComponent(url)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  cache.set(url, { at: Date.now(), data });
  return data;
}

/** Gửi giá người dùng đang thấy (chỉ gọi khi đã bật "Góp giá") */
async function observe(payload) {
  const base = await server();
  const res = await fetch(`${base}/api/ext/observe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  // Giá vừa đổi trên máy chủ: bỏ bản lưu tạm để lần xem sau lấy dữ liệu mới
  if (data.status === "created" || data.status === "updated") cache.delete(payload.url);
  return data;
}

/** Gửi đánh giá công khai đang hiện trên trang (chỉ khi đã bật "Góp giá") */
async function reviews(payload) {
  const base = await server();
  const res = await fetch(`${base}/api/ext/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (data.added) cache.delete(payload.url);
  return data;
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === "reviews") {
    reviews(msg.payload)
      .then((data) => reply({ ok: true, data }))
      .catch((err) => reply({ ok: false, error: String(err.message || err) }));
    return true;
  }
  if (msg?.type === "lookup") {
    lookup(msg.url)
      .then((data) => reply({ ok: true, data }))
      .catch((err) => reply({ ok: false, error: String(err.message || err) }));
    return true; // trả lời bất đồng bộ
  }
  if (msg?.type === "observe") {
    observe(msg.payload)
      .then((data) => reply({ ok: true, data }))
      .catch((err) => reply({ ok: false, error: String(err.message || err) }));
    return true;
  }
  if (msg?.type === "server") {
    server().then((s) => reply(s));
    return true;
  }
});

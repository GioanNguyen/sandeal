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
  const res = await fetch(`${base}/api/ext/lookup?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  cache.set(url, { at: Date.now(), data });
  return data;
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === "lookup") {
    lookup(msg.url)
      .then((data) => reply({ ok: true, data }))
      .catch((err) => reply({ ok: false, error: String(err.message || err) }));
    return true; // trả lời bất đồng bộ
  }
  if (msg?.type === "server") {
    server().then((s) => reply(s));
    return true;
  }
});

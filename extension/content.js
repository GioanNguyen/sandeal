(() => {
  // Nhận diện trang sản phẩm (bản rút gọn của src/lib/links.ts)
  function isProductUrl(href) {
    try {
      const u = new URL(href);
      const h = u.hostname, p = decodeURIComponent(u.pathname);
      if (h.endsWith("shopee.vn")) return /-i\.\d+\.\d+/.test(p) || /\/product\/\d+\/\d+/.test(p);
      if (h.endsWith("lazada.vn")) return /-i\d+(-s\d+)?\.html/.test(p);
      if (h.endsWith("tiktok.com")) return /\/product\/\d{6,}/.test(p) || /\/pdp\/[^/]*\/\d{6,}/.test(p);
    } catch (e) {}
    return false;
  }

  const LABEL = { shopee: "Shopee", lazada: "Lazada", tiktok: "TikTok Shop" };
  const vnd = (n) => new Intl.NumberFormat("vi-VN").format(Math.round(n)) + " ₫";
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  let host, root, lastUrl = "", collapsed = false;

  function mount() {
    if (host) return;
    host = document.createElement("div");
    host.id = "san-deal-ext";
    host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483646;";
    root = host.attachShadow({ mode: "open" });
    document.documentElement.appendChild(host);
    chrome.storage.local.get("collapsed").then((v) => { collapsed = !!v.collapsed; });
  }
  function unmount() { host?.remove(); host = root = null; }

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .card { width: 320px; background: #fff; color: #1c1a19; border-radius: 16px; box-shadow: 0 12px 40px rgb(0 0 0 / 22%); border: 1px solid #f1e3da; overflow: hidden; font-size: 14px; line-height: 1.45; }
    .head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: linear-gradient(120deg,#e8491d,#ffa41b); color: #fff; font-weight: 800; }
    .head button { margin-left: auto; background: rgb(255 255 255 / 20%); border: 0; color: #fff; width: 28px; height: 28px; border-radius: 8px; cursor: pointer; font-size: 16px; }
    .body { padding: 12px; display: grid; gap: 10px; }
    .verdict { padding: 8px 10px; border-radius: 10px; font-weight: 700; }
    .good { background: #dcfce7; color: #047857; } .wait { background: #fef3c7; color: #b45309; } .new { background: #eef2ff; color: #3730a3; } .warn { background: #fee2e2; color: #b91c1c; }
    .verdict small { display: block; font-weight: 400; color: #1c1a19; }
    .kpis { display: grid; grid-template-columns: repeat(3,1fr); gap: 6px; }
    .kpi { background: #fff7f2; border-radius: 8px; padding: 6px 8px; }
    .kpi span { display: block; font-size: 11px; color: #5b6170; } .kpi b { font-size: 13px; }
    svg { display: block; width: 100%; height: 64px; }
    .offers { display: grid; gap: 4px; }
    .offer { display: flex; justify-content: space-between; font-size: 13px; padding: 4px 8px; border-radius: 8px; color: inherit; text-decoration: none; }
    .offer.best { background: #dcfce7; } .offer:hover { background: #fff0e8; }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .btn { display: block; text-align: center; padding: 9px 8px; border-radius: 999px; font-weight: 700; font-size: 13px; text-decoration: none; border: 1.5px solid #f1e3da; color: #1c1a19; }
    .btn.primary { background: #d0390f; color: #fff; border-color: #d0390f; grid-column: 1 / -1; }
    .muted { color: #5b6170; font-size: 12px; }
    .pill { display: inline-flex; align-items: center; gap: 8px; background: #d0390f; color: #fff; font-weight: 800; padding: 10px 14px; border-radius: 999px; border: 0; cursor: pointer; box-shadow: 0 8px 24px rgb(0 0 0 / 25%); font-size: 13px; }
    @media (prefers-color-scheme: dark) {
      .card { background: #1b1d22; color: #f2f3f5; border-color: #2d3139; }
      .kpi { background: #23262d; } .kpi span, .muted { color: #a1a7b3; }
      .btn { color: #f2f3f5; border-color: #2d3139; } .offer:hover { background: #23262d; }
      .verdict small { color: #f2f3f5; } .good { background: #12301f; color: #34d399; } .wait { background: #3a2c0c; color: #fbbf24; } .new { background: #1e1b4b; color: #a5b4fc; } .warn { background: #3b1414; color: #fca5a5; }
      .offer.best { background: #12301f; }
    }`;

  function spark(history, current) {
    const pts = [...history, [Date.now(), current]];
    if (pts.length < 2 || pts.every((p) => p[1] === pts[0][1])) return "";
    const t0 = pts[0][0], t1 = pts[pts.length - 1][0];
    const ys = pts.map((p) => p[1]);
    const lo = Math.min(...ys), hi = Math.max(...ys), W = 296, H = 60;
    const x = (t) => ((t - t0) / Math.max(1, t1 - t0)) * W;
    const y = (v) => 4 + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - 8);
    let d = `M${x(t0)},${y(pts[0][1])}`;
    for (let i = 1; i < pts.length; i++) d += ` H${x(pts[i][0])} V${y(pts[i][1])}`;
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Biểu đồ giá"><line x1="0" x2="${W}" y1="${y(lo)}" y2="${y(lo)}" stroke="#047857" stroke-dasharray="4 4"/><path d="${d}" fill="none" stroke="#d0390f" stroke-width="2"/><circle cx="${x(t1)}" cy="${y(current)}" r="4" fill="#d0390f"/></svg>`;
  }

  function render(state) {
    mount();
    const style = `<style>${CSS}</style>`;
    if (collapsed && state.kind === "found") {
      const p = state.data.product;
      root.innerHTML = `${style}<button class="pill" id="open">Săn Deal · ${p.sample ? "Dữ liệu mẫu · " : ""}${p.verdict === "good" ? "Giá tốt" : p.verdict === "new" ? "Đang theo dõi" : "Chưa tốt nhất"} · ${p.realDropPct >= 1 ? "giảm thật " + Math.round(p.realDropPct) + "%" : vnd(p.price)}</button>`;
      root.getElementById("open").onclick = () => { collapsed = false; chrome.storage.local.set({ collapsed }); render(state); };
      return;
    }
    let body = "";
    if (state.kind === "loading") body = `<p class="muted">Đang kiểm tra lịch sử giá…</p>`;
    else if (state.kind === "error") body = `<p class="muted">Không kết nối được máy chủ Săn Deal (${esc(state.error)}). Kiểm tra địa chỉ trong phần Tuỳ chọn của tiện ích.</p>`;
    else if (state.kind === "queued") body = `<p>Chưa có dữ liệu cho sản phẩm này. Chúng tôi đã ghi nhận và sẽ bắt đầu theo dõi giá.</p><a class="btn" target="_blank" href="${esc(state.data.checkUrl)}">Mở trên Săn Deal</a>`;
    else {
      const { product: p, offers, links } = state.data;
      const v = p.verdict === "good"
        ? `<div class="verdict good">Giá tốt, có thể mua<small>Rẻ hơn ${Math.max(0, Math.round((1 - p.price / p.usual) * 100))}% so với giá thường ngày.</small></div>`
        : p.verdict === "new"
        ? `<div class="verdict new">Mới bắt đầu theo dõi<small>Cần khoảng 7 ngày dữ liệu để đánh giá.</small></div>`
        : `<div class="verdict wait">Chưa phải giá tốt nhất<small>Từng có giá ${vnd(p.low90)} trong 90 ngày.</small></div>`;
      const cheaper = offers.length > 1 && offers[0].id !== p.id ? offers[0] : null;
      const ago = (() => {
        const m = Math.round((Date.now() - (p.priceAt || Date.now())) / 60000);
        return m < 1 ? "vừa xong" : m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`;
      })();
      const sample = p.sample ? `<div class="verdict warn">Dữ liệu mẫu – không phải giá thật<small>Máy chủ Săn Deal đang chạy thử bằng dữ liệu mẫu, các con số bên dưới là giả.</small></div>` : "";
      body = `${sample}${v}
        <div class="kpis"><div class="kpi"><span>Hiện tại</span><b>${vnd(p.price)}</b></div><div class="kpi"><span>Thấp nhất</span><b>${vnd(p.low90)}</b></div><div class="kpi"><span>Thường ngày</span><b>${vnd(p.usual)}</b></div></div>
        <div class="muted">Giá Săn Deal cập nhật ${ago}. Giá trên trang có thể khác theo phân loại bạn chọn hoặc voucher của shop.</div>
        ${spark(p.history, p.price)}
        ${p.afterCodes < p.price ? `<div class="muted">Sau mã giảm tốt nhất: <b>${vnd(p.afterCodes)}</b> · <a target="_blank" href="${esc(links.calc)}">cách áp mã</a></div>` : ""}
        ${offers.length > 1 ? `<div class="offers">${offers.map((o, i) => `<a class="offer${i === 0 ? " best" : ""}" target="_blank" href="${esc(o.detail)}"><span>${LABEL[o.platform] || o.platform}${o.id === p.id ? " (đang xem)" : ""}</span><b>${vnd(o.price)}</b></a>`).join("")}</div>` : ""}
        ${cheaper ? `<div class="verdict wait" style="font-weight:600">${LABEL[cheaper.platform]} đang rẻ hơn ${vnd(p.price - cheaper.price)}</div>` : ""}
        <div class="actions">
          <a class="btn" target="_blank" href="${esc(links.detail)}">Lịch sử giá</a>
          <a class="btn" target="_blank" href="${esc(links.watch)}">Báo khi giảm</a>
          <a class="btn primary" target="_blank" href="${esc(links.buy)}" title="Mua qua link Săn Deal để ủng hộ chúng tôi (giá không đổi)">Mua qua Săn Deal</a>
        </div>
        <div class="muted">Mua qua link Săn Deal giúp web duy trì, giá bạn trả không đổi.</div>`;
    }
    root.innerHTML = `${style}<div class="card" role="complementary" aria-label="Săn Deal"><div class="head">Săn Deal<button id="min" aria-label="Thu nhỏ">–</button><button id="close" aria-label="Đóng" style="margin-left:4px">×</button></div><div class="body">${body}</div></div>`;
    root.getElementById("close").onclick = unmount;
    root.getElementById("min").onclick = () => { collapsed = true; chrome.storage.local.set({ collapsed }); render(state); };
  }

  async function check() {
    const href = location.href;
    if (href === lastUrl) return;
    lastUrl = href;
    if (!isProductUrl(href)) return unmount();
    render({ kind: "loading" });
    const r = await chrome.runtime.sendMessage({ type: "lookup", url: href }).catch((e) => ({ ok: false, error: String(e) }));
    if (location.href !== href) return; // đã chuyển trang
    if (!r?.ok) return render({ kind: "error", error: r?.error || "lỗi" });
    if (r.data.status === "found") render({ kind: "found", data: r.data });
    else if (r.data.status === "queued") render({ kind: "queued", data: r.data });
    else unmount();
  }

  // Shopee/TikTok là web một trang: theo dõi thay đổi URL
  check();
  setInterval(check, 1000);
})();

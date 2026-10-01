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

  /** Phiên bản nội dung đồng ý góp dữ liệu (2 = giá + đánh giá) */
  const CONSENT_V = 2;
  const LABEL = { shopee: "Shopee", lazada: "Lazada", tiktok: "TikTok Shop" };
  const vnd = (n) => new Intl.NumberFormat("vi-VN").format(Math.round(n)) + " ₫";
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  let host, root, lastUrl = "", collapsed = false;
  let current = null; // trạng thái đang hiển thị (để vẽ lại khi người dùng bấm đồng ý góp giá)

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
    .consent { border: 1.5px dashed #f1b89f; border-radius: 10px; padding: 8px 10px; font-size: 12.5px; }
    .consent b { display: block; font-size: 13px; margin-bottom: 2px; }
    .consent .row { display: flex; gap: 6px; margin-top: 6px; }
    .consent button { flex: 1; min-height: 32px; border-radius: 999px; border: 1.5px solid #f1e3da; background: transparent; color: inherit; font-weight: 700; cursor: pointer; font-size: 12.5px; }
    .consent button.yes { background: #d0390f; border-color: #d0390f; color: #fff; }
    a.verdict.risk { display: block; text-decoration: none; }
    .rv { font-size: 12.5px; background: #fff7f2; border-radius: 10px; padding: 8px 10px; }
    .pill { display: inline-flex; align-items: center; gap: 8px; background: #d0390f; color: #fff; font-weight: 800; padding: 10px 14px; border-radius: 999px; border: 0; cursor: pointer; box-shadow: 0 8px 24px rgb(0 0 0 / 25%); font-size: 13px; }
    @media (prefers-color-scheme: dark) {
      .card { background: #1b1d22; color: #f2f3f5; border-color: #2d3139; }
      .kpi { background: #23262d; } .kpi span, .muted { color: #a1a7b3; }
      .btn { color: #f2f3f5; border-color: #2d3139; } .offer:hover { background: #23262d; }
      .verdict small { color: #f2f3f5; } .good { background: #12301f; color: #34d399; } .wait { background: #3a2c0c; color: #fbbf24; } .new { background: #1e1b4b; color: #a5b4fc; } .warn { background: #3b1414; color: #fca5a5; }
      .offer.best { background: #12301f; } .rv { background: #23262d; }
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

  function consentBox() {
    return `<div class="consent" role="group" aria-label="Góp giá"><b>Góp giá & đánh giá ẩn danh?</b>Khi bạn xem trang sản phẩm, tiện ích gửi <b style="display:inline">tên, giá, ảnh</b> sản phẩm và <b style="display:inline">các đánh giá đang hiện trên trang</b> (số sao, nội dung, không gồm tên người đánh giá) cho Săn Deal để xây lịch sử giá và tóm tắt đánh giá cho mọi người. Không gửi thông tin gì về bạn. Đổi lại được trong Tuỳ chọn.<div class="row"><button class="yes" id="c-yes">Đồng ý</button><button id="c-no">Không</button></div></div>`;
  }

  function render(state) {
    current = state;
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
    else if (state.kind === "queued") body = `<p>${state.contributing ? "Đang ghi nhận giá từ trang này để bắt đầu theo dõi…" : "Chưa có dữ liệu cho sản phẩm này. Chúng tôi đã ghi nhận và sẽ bắt đầu theo dõi giá."}</p><a class="btn" target="_blank" href="${esc(state.data.checkUrl)}">Mở trên Săn Deal</a>`;
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
      const ins = state.data.insight;
      const risk = ins && ins.risk && ins.risk.level !== "none"
        ? (ins.risk.level === "low"
          ? `<div class="muted">Lưu ý: ${esc(ins.risk.flags.map((f) => f.title).join("; "))}</div>`
          : `<a class="verdict warn risk" target="_blank" href="${esc(links.reviews || links.detail)}">⚠ ${esc(ins.risk.label)}<small>${ins.risk.flags.filter((f) => f.level !== "low").map((f) => esc(f.title)).join("<br>")}</small></a>`)
        : "";
      const rv = ins && ins.reviews
        ? `<div class="rv"><b>${ins.reviews.ai ? "✨ Tóm tắt đánh giá (AI)" : "Người mua nói gì"}</b> <span class="muted">· ${ins.reviews.count} đánh giá</span><br>${esc(ins.reviews.summary)}</div>`
        : "";
      const vr = state.variant
        ? `<div class="rv"><b>Phân loại bạn chọn</b><br>${esc(state.variant.name)}: <b>${vnd(state.variantPrice || state.variant.price)}</b>${state.variant.points >= 2 ? ` · thấp nhất 90 ngày <b>${vnd(state.variant.low90)}</b>` : " · Săn Deal bắt đầu theo dõi giá phân loại này"}${state.variant.points >= 2 && (state.variantPrice || state.variant.price) <= state.variant.low90 ? " ✓" : ""}<br><a target="_blank" href="${esc(links.detail)}#phan-loai">Báo khi phân loại này giảm giá</a></div>`
        : "";
      body = `${sample}${risk}${v}${vr}${rv}
        <div class="kpis"><div class="kpi"><span>Hiện tại</span><b>${vnd(p.price)}</b></div><div class="kpi"><span>Thấp nhất</span><b>${vnd(p.low90)}</b></div><div class="kpi"><span>Thường ngày</span><b>${vnd(p.usual)}</b></div></div>
        <div class="muted">Giá Săn Deal cập nhật ${ago}. Giá trên trang có thể khác theo phân loại bạn chọn hoặc voucher của shop.</div>
        ${spark(p.history, p.price)}
        ${p.forecast ? (p.forecast.pct >= 3
          ? `<div class="muted">📅 Dự kiến ${esc(p.forecast.sale)} (còn ${p.forecast.days} ngày): <b>~${vnd(p.forecast.expected)}</b> · chờ có thể rẻ hơn ~${vnd(p.forecast.save)}. <small>Ước tính từ ${esc(p.forecast.basisText)}.</small></div>`
          : `<div class="muted">📅 ${esc(p.forecast.sale)} (còn ${p.forecast.days} ngày): các đợt trước giá gần như không giảm thêm.</div>`) : ""}
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
    if (state.askConsent && (state.kind === "found" || state.kind === "queued")) body += consentBox();
    root.innerHTML = `${style}<div class="card" role="complementary" aria-label="Săn Deal"><div class="head">Săn Deal<button id="min" aria-label="Thu nhỏ">–</button><button id="close" aria-label="Đóng" style="margin-left:4px">×</button></div><div class="body">${body}</div></div>`;
    root.getElementById("close").onclick = unmount;
    const yes = root.getElementById("c-yes"), no = root.getElementById("c-no");
    if (yes) yes.onclick = async () => { await chrome.storage.sync.set({ contribute: true, contributeV: CONSENT_V }); render({ ...state, askConsent: false }); contribute(location.href, state, true); };
    if (no) no.onclick = async () => { await chrome.storage.sync.set({ contribute: false }); render({ ...state, askConsent: false }); };
    root.getElementById("min").onclick = () => { collapsed = true; chrome.storage.local.set({ collapsed }); render(state); };
  }

  /**
   * Góp giá: đọc dữ liệu sản phẩm mà trang công khai (JSON-LD / meta), thử lại vài lần vì trang tải dần,
   * rồi gửi qua nền tiện ích. Món chưa có trên Săn Deal thì hiện dữ liệu ngay sau khi ghi nhận.
   */
  async function contribute(href, state, withReviews) {
    // Trang một-trang cần chút thời gian để thay dữ liệu của sản phẩm mới
    await new Promise((ok) => setTimeout(ok, 1500));
    for (let i = 0; i < 8; i++) {
      if (location.href !== href) return;
      const d = self.SanDealExtract && self.SanDealExtract.fromDocument(document, href);
      if (d && d.price > 0) {
        const r = await chrome.runtime.sendMessage({ type: "observe", payload: { url: href, ...d } }).catch(() => null);
        if (location.href !== href) return;
        if (withReviews) collectReviews(href);
        watchVariant(href);
        if (state.kind === "queued" && r?.ok && r.data?.status === "created") {
          const again = await chrome.runtime.sendMessage({ type: "lookup", url: href }).catch(() => null);
          if (location.href === href && again?.ok && again.data.status === "found") render({ kind: "found", data: again.data });
        }
        return;
      }
      await new Promise((ok) => setTimeout(ok, 1000));
    }
    if (state.kind === "queued" && location.href === href) render({ ...state, contributing: false });
  }

  /**
   * Góp đánh giá: phần đánh giá trên sàn tải dần khi người dùng cuộn / chuyển trang đánh giá, nên kiểm tra lại
   * mỗi 4 giây trong 5 phút, chỉ gửi đánh giá mới thấy. Chỉ chạy khi đã bật "Góp giá".
   */
  /**
   * Giá theo phân loại: khi người dùng bấm chọn màu/size… trên trang, gửi giá của đúng phân loại đó
   * (mỗi phân loại một lần cho mỗi mức giá), rồi hiện giá thấp nhất 90 ngày của phân loại trong ô Săn Deal.
   */
  let variantTimer = null;
  function watchVariant(href) {
    clearInterval(variantTimer);
    const sent = new Set();
    let ticks = 0;
    variantTimer = setInterval(async () => {
      if (location.href.split("#")[0].replace(/-s\d+\.html.*/, "") !== href.split("#")[0].replace(/-s\d+\.html.*/, "") || ++ticks > 600) { clearInterval(variantTimer); return; }
      const v = self.SanDealExtract && self.SanDealExtract.readVariant(document, location.href);
      if (!v) return;
      const sig = JSON.stringify([v.groups, v.skuId, v.price]);
      if (sent.has(sig)) return;
      sent.add(sig);
      const r = await chrome.runtime.sendMessage({ type: "variant", payload: { url: location.href, ...v } }).catch(() => null);
      if (r && r.ok && r.data && r.data.variant && current && current.kind === "found") render({ ...current, variant: r.data.variant, variantPrice: v.price });
    }, 1500);
  }

  let reviewTimer = null;
  function collectReviews(href) {
    clearInterval(reviewTimer);
    const sent = new Set();
    let countsSent = false, ticks = 0;
    const key = (r) => r.rating + "|" + String(r.text || "").slice(0, 80) + "|" + (r.approx ? "" : r.date || "");
    const tick = async () => {
      if (location.href !== href || ++ticks > 75) { clearInterval(reviewTimer); return; }
      const x = self.SanDealExtract && self.SanDealExtract.reviewsFromDocument(document, href);
      if (!x) return;
      const fresh = x.reviews.filter((r) => !sent.has(key(r)));
      const hasCounts = x.ratingCount !== undefined || x.starCounts;
      if (!fresh.length && (countsSent || !hasCounts)) return;
      fresh.forEach((r) => sent.add(key(r)));
      countsSent = countsSent || !!hasCounts;
      await chrome.runtime.sendMessage({ type: "reviews", payload: { url: href, ratingCount: x.ratingCount, starCounts: x.starCounts, reviews: fresh } }).catch(() => null);
    };
    reviewTimer = setInterval(tick, 4000);
    tick();
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
    if (r.data.status !== "found" && r.data.status !== "queued") return unmount();
    const { contribute: consent, contributeV } = await chrome.storage.sync.get(["contribute", "contributeV"]);
    // Bản 1.5.0 góp thêm đánh giá: người đã đồng ý góp giá từ trước được hỏi lại với nội dung mới (vẫn góp giá như cũ)
    const reviewsOk = consent === true && contributeV === CONSENT_V;
    const state = { kind: r.data.status, data: r.data, askConsent: consent === undefined || (consent === true && !reviewsOk), contributing: consent === true };
    render(state);
    if (consent === true) contribute(href, state, reviewsOk);
  }

  // Shopee/TikTok là web một trang: theo dõi thay đổi URL
  check();
  setInterval(check, 1000);
})();

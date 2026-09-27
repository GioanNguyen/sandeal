/**
 * Đọc thông tin sản phẩm từ dữ liệu có cấu trúc mà chính trang công khai cho máy tìm kiếm
 * (JSON-LD schema.org/Product, thẻ meta og:/product:). Không đọc gì khác trên trang, không đọc thông tin người dùng.
 * Chỉ trả kết quả khi dữ liệu khớp đúng sản phẩm trên thanh địa chỉ (trang một-trang có thể còn dữ liệu cũ).
 */
(function (g) {
  /** Mã sản phẩm trong đường dẫn (để đối chiếu) */
  function itemIdOf(href) {
    try {
      const u = new URL(href);
      const h = u.hostname, p = decodeURIComponent(u.pathname);
      if (h.endsWith("shopee.vn")) return (p.match(/-i\.\d+\.(\d+)/) || p.match(/\/product\/\d+\/(\d+)/) || [])[1] || null;
      if (h.endsWith("lazada.vn")) return (p.match(/-i(\d+)(?:-s\d+)?\.html/) || [])[1] || null;
      if (h.endsWith("tiktok.com")) return (p.match(/\/product\/(\d{6,})/) || p.match(/\/pdp\/[^/]*\/(\d{6,})/) || [])[1] || null;
    } catch (e) {}
    return null;
  }

  /** "129000", "129000.00", 129000, "129.000" -> 129000 */
  function money(v) {
    if (typeof v === "number") return v;
    const s = String(v == null ? "" : v).trim();
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ""));
    if (/^\d{1,3}(,\d{3})+$/.test(s)) return Number(s.replace(/,/g, ""));
    const n = Number(s.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : NaN;
  }

  /** Bỏ dấu, chữ thường, chỉ giữ chữ và số */
  function norm(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }
  /**
   * Tên sản phẩm có khớp tiêu đề tab không (trang một-trang như Shopee đổi tiêu đề khi chuyển sản phẩm
   * nhưng có thể giữ nguyên dữ liệu JSON-LD/meta của sản phẩm trước). Không có tiêu đề thì coi như không kiểm được.
   */
  function nameMatchesTitle(name, title) {
    const n = norm(name), t = norm(title);
    if (!n || !t) return false;
    if (t.includes(n.slice(0, 30))) return true;
    const words = n.split(" ").filter((w) => w.length >= 2).slice(0, 10);
    if (!words.length) return false;
    const hit = words.filter((w) => t.split(" ").includes(w)).length;
    return hit / words.length >= 0.7;
  }

  function findProducts(node, out) {
    if (!node || typeof node !== "object") return out;
    if (Array.isArray(node)) { node.forEach((n) => findProducts(n, out)); return out; }
    const t = node["@type"];
    if (t === "Product" || (Array.isArray(t) && t.includes("Product"))) out.push(node);
    if (node["@graph"]) findProducts(node["@graph"], out);
    return out;
  }

  function firstImage(img) {
    if (!img) return undefined;
    if (typeof img === "string") return img;
    if (Array.isArray(img)) return firstImage(img[0]);
    return img.url || img.contentUrl;
  }

  /**
   * Từ các khối JSON-LD đã đọc + thẻ meta + tiêu đề tab. Trả { name, price, image, rating } hoặc null.
   * Chấp nhận khi: khối dữ liệu tự nhắc đúng mã sản phẩm, HOẶC tên trong dữ liệu khớp tiêu đề tab.
   * (Địa chỉ canonical một mình không đủ: Shopee có thể đổi canonical mà giữ dữ liệu sản phẩm cũ.)
   */
  function fromData(ldBlocks, meta, href, title) {
    const id = itemIdOf(href);
    if (!id) return null;

    const products = [];
    for (const b of ldBlocks) findProducts(b, products);
    for (const p of products) {
      // Khối dữ liệu phải nhắc đúng mã sản phẩm (url/sku/offers), hoặc tên phải khớp tiêu đề tab hiện tại
      const mentionsId = JSON.stringify(p).includes(id);
      if (!mentionsId && !nameMatchesTitle(p.name, title)) continue;
      if (mentionsId && title && p.name && !nameMatchesTitle(p.name, title)) continue; // dữ liệu nhắc mã nhưng tên lệch tiêu đề: không chắc, bỏ
      const offers = [].concat(p.offers || []);
      let price = NaN, currency = "";
      for (const o of offers) {
        if (!o) continue;
        if (/OutOfStock|SoldOut|Discontinued/i.test(String(o.availability || ""))) return null; // hết hàng: không gửi
        const v = money(o.lowPrice != null ? o.lowPrice : o.price);
        if (Number.isFinite(v) && (!Number.isFinite(price) || v < price)) { price = v; currency = String(o.priceCurrency || ""); }
      }
      if (!Number.isFinite(price) || price <= 0 || (currency && currency.toUpperCase() !== "VND")) continue;
      const rating = p.aggregateRating ? Number(p.aggregateRating.ratingValue) : undefined;
      return { name: String(p.name || "").trim(), price, image: firstImage(p.image), rating: rating > 0 ? rating : undefined };
    }

    // Dự phòng: thẻ meta sản phẩm (địa chỉ og/canonical đúng mã VÀ tên khớp tiêu đề tab)
    const canon = String(meta["og:url"] || meta.canonical || "");
    if (canon.includes(id) && nameMatchesTitle(meta["og:title"], title) && meta["product:price:amount"]) {
      const cur = String(meta["product:price:currency"] || "VND").toUpperCase();
      const price = money(meta["product:price:amount"]);
      if (cur === "VND" && price > 0) return { name: String(meta["og:title"] || "").trim(), price, image: meta["og:image"] };
    }
    return null;
  }

  /** Đọc từ trang đang mở */
  function fromDocument(doc, href) {
    const ld = [];
    doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      try { ld.push(JSON.parse(s.textContent || "")); } catch (e) {}
    });
    const meta = {};
    doc.querySelectorAll("meta[property], meta[name]").forEach((m) => {
      const k = m.getAttribute("property") || m.getAttribute("name");
      if (k && /^(og:|product:)/.test(k)) meta[k] = m.getAttribute("content");
    });
    const c = doc.querySelector('link[rel="canonical"]');
    if (c) meta.canonical = c.getAttribute("href");
    return fromData(ld, meta, href, doc.title);
  }

  g.SanDealExtract = { itemIdOf, money, nameMatchesTitle, fromData, fromDocument };
})(typeof self !== "undefined" ? self : globalThis);

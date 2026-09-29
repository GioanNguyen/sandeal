/**
 * Đọc thông tin sản phẩm từ dữ liệu có cấu trúc mà chính trang công khai cho máy tìm kiếm
 * (JSON-LD schema.org/Product + BreadcrumbList, thẻ meta og:/product:): tên, giá, ảnh, số sao, danh mục;
 * cộng thêm giá gạch ngang (giá gốc) hiển thị ngay cạnh giá đang bán. Không đọc thông tin người dùng.
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

  /** Tất cả ảnh (tối đa 5) */
  function allImages(img) {
    const out = [];
    for (const i of [].concat(img || [])) {
      const u = typeof i === "string" ? i : i && (i.url || i.contentUrl);
      if (u && !out.includes(u)) out.push(u);
    }
    return out.slice(0, 5);
  }

  /** Danh mục cấp 1 từ BreadcrumbList (bỏ "Shopee"/"Trang chủ" đầu và tên sản phẩm cuối) */
  function categoryOf(ldBlocks, productName) {
    const lists = [];
    (function find(n) {
      if (!n || typeof n !== "object") return;
      if (Array.isArray(n)) return n.forEach(find);
      if (n["@type"] === "BreadcrumbList") lists.push(n);
      if (n["@graph"]) find(n["@graph"]);
    })(ldBlocks);
    for (const l of lists) {
      const names = [].concat(l.itemListElement || [])
        .slice()
        .sort((a, b) => Number(a && a.position) - Number(b && b.position))
        .map((e) => String((e && (e.name || (e.item && e.item.name))) || "").trim())
        .filter(Boolean);
      const cats = names.filter((n, i) => !(i === 0 && /^(shopee|lazada|tiktok|trang chủ|home)/i.test(n)) && norm(n) !== norm(productName));
      if (cats[0]) return cats[0];
    }
    return undefined;
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
      const images = allImages(p.image);
      return {
        name: String(p.name || "").trim(),
        price,
        image: firstImage(p.image),
        rating: rating > 0 ? rating : undefined,
        ...(images.length > 1 ? { images: images.slice(1) } : {}),
        ...(categoryOf(ldBlocks, p.name) ? { category: categoryOf(ldBlocks, p.name) } : {}),
      };
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

  /** Số đầu tiên trong chuỗi giá hiển thị: "₫1.079.000" -> 1079000, "₫29.900 - ₫39.000" -> 29900 */
  function firstVnd(text) {
    const m = String(text || "").match(/\d[\d.,]*/);
    return m ? money(m[0].replace(/[.,]\d{1,2}$/, "").replace(/[.,]/g, "")) : NaN;
  }

  /** Chuỗi chỉ gồm giá (₫, số, dấu chấm/phẩy, khoảng trắng, gạch nối) */
  function priceLike(text) {
    const t = String(text || "").trim();
    return t.length > 0 && t.length <= 40 && /\d/.test(t) && /^[₫đ\s\d.,\-–]+$/i.test(t);
  }

  /**
   * Giá gạch hợp lệ: lớn hơn giá bán, giảm không quá 80%. Nhiều giá gạch khác nhau quanh giá bán -> không chắc, bỏ.
   */
  function pickStrike(values, price) {
    const ok = [...new Set(values.filter((v) => Number.isFinite(v) && v > price * 1.01 && v <= price * 5))];
    return ok.length === 1 ? ok[0] : undefined;
  }

  /**
   * Tìm giá gạch ngang cạnh giá đang bán: tìm phần tử hiển thị đúng giá bán (từ dữ liệu có cấu trúc),
   * rồi tìm phần tử gạch ngang (text-decoration: line-through, thẻ s/del) trong vài cấp cha gần nhất.
   * Không tìm được hoặc có lỗi -> undefined (vẫn gửi giá bán như cũ).
   */
  function strikeFromDocument(doc, price) {
    try {
      const view = doc.defaultView;
      const struck = (el) => {
        if (/^(S|DEL|STRIKE)$/.test(el.tagName)) return true;
        const cs = view && view.getComputedStyle ? view.getComputedStyle(el) : null;
        return !!cs && /line-through/.test(String(cs.textDecorationLine || cs.textDecoration || ""));
      };
      const all = Array.from(doc.querySelectorAll("body *")).slice(0, 20000);
      const anchors = all.filter((el) => el.children.length === 0 && priceLike(el.textContent) && firstVnd(el.textContent) === price && !struck(el)).slice(0, 5);
      for (const a of anchors) {
        let box = a.parentElement;
        for (let depth = 0; box && depth < 4; depth++, box = box.parentElement) {
          const vals = Array.from(box.querySelectorAll("*"))
            .filter((el) => priceLike(el.textContent) && (struck(el) || (el.parentElement && struck(el.parentElement) && box.contains(el.parentElement))))
            .map((el) => firstVnd(el.textContent));
          if (vals.length) return pickStrike(vals, price);
        }
      }
    } catch (e) {}
    return undefined;
  }

  /** Đọc từ trang đang mở */
  function fromDocument(doc, href) {
    const d = fromDocumentData(doc, href);
    if (d) {
      const original = strikeFromDocument(doc, d.price);
      if (original) d.originalPrice = original;
    }
    return d;
  }

  /** Chỉ phần dữ liệu có cấu trúc */
  function fromDocumentData(doc, href) {
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

  g.SanDealExtract = { itemIdOf, money, nameMatchesTitle, fromData, categoryOf, fromDocument, firstVnd, priceLike, pickStrike, strikeFromDocument };
})(typeof self !== "undefined" ? self : globalThis);

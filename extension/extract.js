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

  // ===================== Đánh giá người mua =====================
  // Chỉ đọc phần đánh giá công khai đang hiện trên trang: số sao, nội dung, phân loại, ngày, có ảnh/video.
  // KHÔNG đọc tên, ảnh đại diện người đánh giá.

  /** "1,2k" -> 1200, "3,4tr" -> 3400000, "120" -> 120 */
  function countNum(s) {
    const m = String(s || "").trim().toLowerCase().match(/^([\d.,]+)\s*(k|tr|m)?/);
    if (!m) return NaN;
    let n = m[2] ? Number(m[1].replace(",", ".")) : Number(m[1].replace(/[.,]/g, ""));
    if (m[2] === "k") n *= 1e3;
    if (m[2] === "tr" || m[2] === "m") n *= 1e6;
    return Math.round(n);
  }

  /** Từ JSON-LD: aggregateRating + review[] (schema.org) */
  function reviewsFromData(ldBlocks) {
    const products = [];
    for (const b of ldBlocks) findProducts(b, products);
    const out = { ratingCount: undefined, reviews: [] };
    for (const p of products) {
      const ar = p.aggregateRating || {};
      const c = Number(ar.ratingCount != null ? ar.ratingCount : ar.reviewCount);
      if (Number.isFinite(c) && c >= 0 && out.ratingCount === undefined) out.ratingCount = c;
      for (const r of [].concat(p.review || [])) {
        if (!r || typeof r !== "object") continue;
        const rating = Number(r.reviewRating && r.reviewRating.ratingValue);
        if (!(rating >= 1 && rating <= 5)) continue;
        out.reviews.push({ rating: Math.round(rating), text: String(r.reviewBody || r.description || "").trim(), date: r.datePublished ? String(r.datePublished) : undefined });
      }
    }
    return out;
  }

  const DATE_RE = /(\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:\d{2})?)|(\b\d{1,2}[-/]\d{1,2}[-/]\d{4}\b)/;
  const VARIANT_RE = /(?:Phân loại hàng|Phân loại|Màu sắc|Kích cỡ|Kích thước|Size)\s*:\s*([^|\n]{1,80})/i;
  const SELLER_REPLY_RE = /\n\s*(Phản hồi của người bán|Phản Hồi Của Người Bán|Seller'?s? response|Phản hồi từ người bán)[\s\S]*$/i;
  const JUNK_LINE_RE = /^(Hữu ích\??|Thích|Báo cáo|Report|\d+|Xem thêm|Phản hồi|\d+\s*(lượt )?thích|Đã mua)$/i;

  /** Số sao trong khung đánh giá: nhóm 5 biểu tượng sao liền nhau, đếm sao "đầy" */
  function starsIn(card, before, view) {
    const groups = Array.from(card.querySelectorAll("*")).filter((el) => {
      const kids = Array.from(el.children);
      return kids.length === 5 && kids.every((k) => k.tagName === kids[0].tagName) && (before ? !!(el.compareDocumentPosition(before) & 4) : true);
    });
    for (const gEl of groups) {
      const kids = Array.from(gEl.children);
      const cls = (k) => String((k.getAttribute && (k.getAttribute("class") || "")) + " " + (k.innerHTML || "").slice(0, 300)).toLowerCase();
      if (!kids.some((k) => /star|rating|sao/.test(cls(k)) || k.tagName === "svg" || k.tagName === "SVG" || k.tagName === "IMG")) continue;
      const full = kids.filter((k) => {
        const c = cls(k);
        if (/(solid|active|full|filled|--on|is-on)/.test(c) && !/(empty|outline|--off|gray|grey)/.test(c)) return true;
        if (/(empty|outline|--off|gray|grey)/.test(c)) return false;
        try {
          const target = k.querySelector && (k.querySelector("path, polygon") || k);
          const cs = view.getComputedStyle(target);
          const col = String(cs.fill && cs.fill !== "none" ? cs.fill : cs.color);
          const m = col.match(/(\d+),\s*(\d+),\s*(\d+)/);
          if (m) return +m[1] > 200 && +m[2] > 100 && +m[3] < 120; // vàng/cam
        } catch (e) {}
        return false;
      }).length;
      if (full >= 1) return full;
    }
    return 0;
  }

  /**
   * Đọc các khung đánh giá đang hiện. Nhận diện theo dòng ngày giờ ("2024-05-01 10:20 | Phân loại hàng: …")
   * rồi lấy khung gần nhất chỉ chứa đúng 1 dòng ngày; nội dung là phần chữ SAU dòng ngày (bỏ tên người đánh giá ở trước),
   * bỏ phần phản hồi của người bán.
   */
  function domReviews(doc) {
    const view = doc.defaultView;
    const out = [];
    const seen = new Set();
    const dateEls = Array.from(doc.querySelectorAll("body *")).slice(0, 30000).filter((el) => {
      if (el.children.length > 2) return false;
      const t = (el.textContent || "").trim();
      return t.length <= 140 && DATE_RE.test(t) && !/₫|đ\b/.test(t);
    });
    for (const dEl of dateEls.slice(0, 80)) {
      let card = dEl.parentElement;
      for (let i = 0; card && i < 7; i++) {
        const dates = ((card.innerText || card.textContent || "").match(new RegExp(DATE_RE.source, "g")) || []).length;
        if (dates > 1) { card = null; break; }
        if ((card.innerText || card.textContent || "").length > (dEl.textContent || "").length + 20) break;
        card = card.parentElement;
      }
      if (!card || seen.has(card)) continue;
      seen.add(card);
      const dText = (dEl.textContent || "").trim();
      const all = String(card.innerText || card.textContent || "").replace(SELLER_REPLY_RE, "");
      const idx = all.indexOf(dText);
      const after = (idx >= 0 ? all.slice(idx + dText.length) : all)
        .split("\n").map((l) => l.trim()).filter((l) => l && !JUNK_LINE_RE.test(l)).join("\n").trim();
      const rating = starsIn(card, dEl, view);
      if (!rating) continue;
      const vm = (dText + "\n" + all).match(VARIANT_RE);
      const media = card.querySelectorAll("video").length > 0 || Array.from(card.querySelectorAll("img")).filter((im) => (im.width || 0) >= 48).length >= 2;
      out.push({ rating, text: after.slice(0, 800), variant: vm ? vm[1].trim() : undefined, date: (dText.match(DATE_RE) || [])[0], media });
    }
    return out;
  }

  /** "5 Sao (1,2k)" "4 sao (120)" -> [1★..5★] */
  function starCountsFromDocument(doc) {
    const counts = [0, 0, 0, 0, 0];
    let found = 0;
    for (const el of Array.from(doc.querySelectorAll("body *")).slice(0, 30000)) {
      if (el.children.length > 2) continue;
      const m = (el.textContent || "").trim().match(/^([1-5])\s*(?:Sao|sao|★)\s*\(([\d.,]+\s*(?:k|tr)?)\)$/);
      if (m && !counts[+m[1] - 1]) { counts[+m[1] - 1] = countNum(m[2]); found++; }
    }
    return found >= 3 ? counts : undefined;
  }

  /** "2 weeks ago", "3 ngày trước", "Hôm qua" -> ngày (ước lượng) dạng YYYY-MM-DD */
  function relativeDate(text, now) {
    const t = String(text || "").trim().toLowerCase();
    const n0 = now ? now.getTime() : Date.now();
    const iso = (ms) => new Date(ms + 7 * 3600e3).toISOString().slice(0, 10);
    if (/^(hôm nay|today|vừa xong|just now)/.test(t) || /(giờ|phút|hour|minute)s? (trước|ago)/.test(t)) return iso(n0);
    if (/^(hôm qua|yesterday)/.test(t)) return iso(n0 - 864e5);
    const m = t.match(/^(\d+|a|an|một)\s*(ngày|day|tuần|week|tháng|month|năm|year)s?\s*(trước|ago)/);
    if (!m) return undefined;
    const k = /^\d+$/.test(m[1]) ? Number(m[1]) : 1;
    const unit = { "ngày": 1, day: 1, "tuần": 7, week: 7, "tháng": 30, month: 30, "năm": 365, year: 365 }[m[2]];
    return iso(n0 - k * unit * 864e5);
  }

  /**
   * Chữ của một phần tử (xuống dòng giữa các khối div/p/li), bỏ các phần con khớp `drop` (ảnh/video…).
   * Không dùng innerText: bản sao tách khỏi trang không có bố cục nên innerText rỗng.
   */
  const BLOCK = /^(DIV|P|LI|UL|OL|SECTION|ARTICLE|H\d|BR|TR|TABLE)$/;
  function textWithout(el, drop) {
    const c = el.cloneNode(true);
    if (drop) c.querySelectorAll(drop).forEach((x) => x.remove());
    let out = "";
    (function walk(n) {
      if (n.nodeType === 3) { out += n.nodeValue; return; }
      if (n.nodeType !== 1 || /^(SCRIPT|STYLE|SVG|svg|NOSCRIPT)$/.test(n.tagName)) return;
      const block = BLOCK.test(n.tagName);
      if (block) out += "\n";
      for (const k of Array.from(n.childNodes)) walk(k);
      if (block) out += "\n";
    })(c);
    return out;
  }
  const tidy = (s) => String(s || "").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l && !JUNK_LINE_RE.test(l) && !/^\d{1,2}:\d{2}$/.test(l)).join("\n").replace(SELLER_REPLY_RE, "").trim();

  /** Shopee: mỗi đánh giá là một khối [data-cmtid]; sao đầy là .icon-rating-solid; dòng "2024-05-01 10:20 | Phân loại hàng: …" */
  function shopeeReviews(doc) {
    const out = [];
    doc.querySelectorAll("[data-cmtid]").forEach((card) => {
      const rating = Math.min(5, card.querySelectorAll(".icon-rating-solid").length);
      if (!rating) return;
      const dEl = Array.from(card.querySelectorAll("*")).find((el) => el.children.length === 0 && /^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/.test((el.textContent || "").trim()));
      const dText = dEl ? dEl.textContent.trim() : "";
      const vm = dText.match(VARIANT_RE);
      const variant = vm ? vm[1].replace(/[\s,]+$/g, "").replace(/^[\s,]+/, "").trim() : "";
      const all = textWithout(card, '.rating-media-list, [class*="media-list"], video, picture, img');
      const idx = dText ? all.indexOf(dText) : -1;
      const text = tidy(idx >= 0 ? all.slice(idx + dText.length) : all);
      out.push({
        rating,
        text: text.slice(0, 800),
        variant: variant || undefined,
        date: (dText.match(DATE_RE) || [])[0],
        media: !!card.querySelector('.rating-media-list img, .rating-media-list video, [class*="video-cover"]'),
      });
    });
    return out;
  }

  /** Lazada: .mod-reviews .item; sao đầy có mask "half_100%"; ngày dạng "2 tuần trước" */
  function lazadaReviews(doc, now) {
    const out = [];
    doc.querySelectorAll(".mod-reviews .item").forEach((card) => {
      const stars = Array.from(card.querySelectorAll(".item-middle .i-rate-star, .review-star .i-rate-star"));
      const rating = stars.filter((st) => {
        const m = (st.innerHTML || "").match(/half_(\d+(?:\.\d+)?)%/);
        return m ? Number(m[1]) >= 50 : /active|full|on\b/.test(String(st.getAttribute("class")));
      }).length;
      if (!(rating >= 1 && rating <= 5)) return;
      const body = card.querySelector(".item-content-main-content-reviews");
      const sku = Array.from(card.querySelectorAll(".skuInfo-item")).map((x) => (x.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean).join(", ");
      const time = card.querySelector(".time");
      const rel = time ? relativeDate(time.textContent, now) : undefined;
      out.push({
        rating,
        text: tidy(body ? textWithout(body) : "").slice(0, 800),
        variant: sku ? sku.slice(0, 80) : undefined,
        date: rel || (time ? (time.textContent.match(DATE_RE) || [])[0] : undefined),
        // Ngày tương đối ("2 tuần trước") đổi theo ngày xem: máy chủ không dùng để chống trùng
        approx: !!rel,
        media: !!card.querySelector(".item-content-main-imgs .img-item, .item-content-main-imgs video"),
      });
    });
    return out;
  }

  /** Lazada: "Reviews(1212)" / "Đánh giá(1.2K)" ở tiêu đề mục đánh giá */
  function lazadaCount(doc) {
    const t = doc.querySelector(".pdp-mod-review-v2 .title-text, .mod-title .title-text");
    const m = t && (t.textContent || "").match(/\(([\d.,]+\s*[KkMm]?)\)/);
    if (!m) return undefined;
    const raw = m[1].replace(/\s/g, "").toLowerCase();
    return countNum(/[km]$/.test(raw) ? raw.replace(/m$/, "tr") : raw);
  }

  /** Mọi đánh giá đọc được trên trang (JSON-LD + khung đang hiện), đã bỏ trùng */
  function reviewsFromDocument(doc, href, now) {
    const ld = [];
    doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      try { ld.push(JSON.parse(s.textContent || "")); } catch (e) {}
    });
    const id = itemIdOf(href || (doc.location && doc.location.href) || "");
    // Shopee có thể nhúng JSON-LD của món khác (gợi ý): chỉ lấy khối nhắc đúng mã sản phẩm
    const own = id ? ld.filter((b) => JSON.stringify(b).includes(id)) : ld;
    const data = reviewsFromData(own);
    const host = String((doc.location && doc.location.hostname) || (href ? new URL(href).hostname : ""));
    let dom = [];
    try {
      dom = host.endsWith("shopee.vn") ? shopeeReviews(doc) : host.endsWith("lazada.vn") ? lazadaReviews(doc, now) : [];
      if (!dom.length) dom = domReviews(doc);
    } catch (e) {}
    const key = (r) => r.rating + "|" + norm(r.text).slice(0, 80) + "|" + (r.approx ? "" : r.date || "");
    const seen = new Set();
    const reviews = [...data.reviews, ...dom].filter((r) => (seen.has(key(r)) ? false : (seen.add(key(r)), true))).slice(0, 60);
    let starCounts;
    try { starCounts = starCountsFromDocument(doc); } catch (e) {}
    let ratingCount = data.ratingCount;
    if (ratingCount === undefined && host.endsWith("lazada.vn")) ratingCount = lazadaCount(doc);
    if (ratingCount === undefined && starCounts) ratingCount = starCounts.reduce((a, b) => a + b, 0);
    return { ratingCount, starCounts, reviews };
  }

  // ===================== Phân loại đang chọn (màu, size…) =====================

  /** Giá đơn (không phải khoảng "14.065₫ - 39.000₫") */
  function singlePrice(text) {
    const t = String(text || "").trim();
    if (!priceLike(t) || /\d\s*[₫đ]?\s*[-–]\s*[₫đ]?\s*\d/.test(t)) return NaN;
    return firstVnd(t);
  }

  /** Shopee: mỗi nhóm là một section có tiêu đề h2 và các nút .selection-box-*; nút đang chọn có .selection-box-selected */
  function shopeeVariant(doc) {
    // Mỗi nhóm = section gần nhất bao các nút lựa chọn (trang lồng nhiều section, không lấy section ngoài)
    const sections = [...new Set(Array.from(doc.querySelectorAll('button[class*="selection-box-"]')).map((btn) => btn.closest("section")).filter(Boolean))];
    if (!sections.length) return null;
    const groups = [];
    for (const s of sections) {
      const sel = s.querySelector("button.selection-box-selected");
      if (!sel) return null; // chưa chọn đủ các nhóm: giá trên trang còn là khoảng giá
      const h = s.querySelector("h2, h3, label");
      groups.push({ group: h ? h.textContent.trim() : "", value: (sel.getAttribute("aria-label") || sel.textContent || "").trim() });
    }
    const box = Array.from(doc.querySelectorAll('[aria-live="polite"]')).find((el) => /[₫đ]/.test(el.textContent || "") && /\d/.test(el.textContent || ""));
    if (!box) return null;
    const leaves = Array.from(box.querySelectorAll("*")).filter((el) => el.children.length === 0 && priceLike(el.textContent));
    if (!leaves.length) return null;
    const price = singlePrice(leaves[0].textContent);
    if (!(price > 0)) return null;
    const orig = leaves.slice(1).map((el) => singlePrice(el.textContent)).find((v) => v > price);
    return { groups, price, originalPrice: orig };
  }

  /** Lazada: nhóm .sku-prop-selection (tiêu đề + tên lựa chọn đang chọn), giá ở khối price-v2, mã SKU trên đường dẫn -s123.html */
  function lazadaVariant(doc, href) {
    const props = Array.from(doc.querySelectorAll(".sku-prop-selection"));
    if (!props.length) return null;
    const groups = [];
    for (const pEl of props) {
      const name = pEl.querySelector(".sku-name");
      const value = name ? name.textContent.trim() : "";
      if (!value) return null;
      const t = pEl.querySelector(".section-title-v2, .section-title");
      const group = t ? t.textContent.trim().replace(/:\s*$/, "") : "";
      if (!groups.some((x) => x.group === group && x.value === value)) groups.push({ group, value });
    }
    const amt = doc.querySelector(".pdp-v2-product-price-content-salePrice-amount, .pdp-price_type_normal");
    const price = amt ? money(amt.textContent.trim()) : NaN;
    if (!(price > 0)) return null;
    const o = doc.querySelector('[class*="originalPrice-amount"], .pdp-price_type_deleted');
    const op = o ? money(o.textContent.trim().replace(/[₫đ\s]/g, "")) : NaN;
    const sku = (String(href || "").match(/-s(\d+)\.html/) || [])[1];
    return { groups, price, originalPrice: op > price ? op : undefined, skuId: sku };
  }

  /** Phân loại người dùng đang chọn + giá của nó; null khi trang không có phân loại hoặc chưa chọn đủ */
  function readVariant(doc, href) {
    const host = String((doc.location && doc.location.hostname) || (href ? new URL(href).hostname : ""));
    try {
      if (host.endsWith("shopee.vn")) return shopeeVariant(doc);
      if (host.endsWith("lazada.vn")) return lazadaVariant(doc, href);
    } catch (e) {}
    return null;
  }

  g.SanDealExtract = { itemIdOf, money, nameMatchesTitle, fromData, categoryOf, fromDocument, firstVnd, priceLike, pickStrike, strikeFromDocument, countNum, reviewsFromData, reviewsFromDocument, domReviews, starCountsFromDocument, shopeeReviews, lazadaReviews, relativeDate, readVariant, singlePrice };
})(typeof self !== "undefined" ? self : globalThis);

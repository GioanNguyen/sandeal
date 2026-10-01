/**
 * Giá theo đơn vị (đ/lít, đ/kg, đ/100ml, đ/đôi, đ/miếng…) tách từ tên sản phẩm.
 * Chỉ trả kết quả khi đọc được chắc chắn; tên mơ hồ ("Combo 3,4,5", "10kg 20kg 30kg", "Combo 2 hũ 600g" –
 * không rõ 600g là mỗi hũ hay tổng) thì bỏ phần không chắc hoặc trả null. Hiển thị sai còn tệ hơn không hiển thị.
 */

export interface UnitInfo {
  /** Tổng số lượng theo đơn vị gốc: ml, g hoặc số cái/đôi/... */
  qty: number;
  kind: "volume" | "weight" | "count";
  /** Đơn vị đếm: "đôi", "miếng", "hũ"… (kind = count) */
  noun?: string;
}

export interface UnitPrice {
  /** Giá cho 1 đơn vị hiển thị */
  per: number;
  /** "lít", "100ml", "kg", "100g", "đôi", "món"… */
  label: string;
  /** Mô tả số lượng đã đọc được, vd "3 lít", "10 đôi" */
  qtyText: string;
  /** Khoá so sánh: chỉ so các món cùng khoá */
  compareKey: string;
}

const L = "a-zà-ỹđ"; // chữ cái tiếng Việt (chữ thường)
const NOT_LETTER = `(?![${L}])`;
const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const PIECES = ["đôi", "cái", "chiếc", "miếng", "viên", "cuộn", "tờ", "quả", "cây"];
const PACKS = ["gói", "bịch", "hộp", "chai", "lọ", "tuýp", "túi", "lon", "hũ", "can", "bình", "thùng"];
const num = (s: string) => Number(s.replace(",", "."));

/**
 * Đồ đựng / thiết bị: số ml, lít, kg trong tên là DUNG TÍCH hoặc TẢI TRỌNG, không phải lượng hàng
 * ("Bình giữ nhiệt 750ml", "Nồi chiên 8L", "Máy giặt 9kg", "Cân điện tử 5kg") -> không tính giá theo dung tích/khối lượng.
 */
const CONTAINER = new RegExp(
  `(?:^|[^${L}])(máy|nồi|chảo|ấm|bình giữ nhiệt|bình nước|bình đựng|bình sữa|ly|cốc|tủ|hộp đựng|hộp cơm|thùng rác|thùng đựng|vali|balo|ba lô|túi đựng|xe|quạt|lò|bếp|cân|tạ|bồn|chậu|thau|xô|can nhựa|khay|hũ thủy tinh|hũ đựng|lọ đựng|chai rỗng|chai nhựa rỗng|bể|hồ)(?![${L}])`,
);

function measures(t: string) {
  const out: { qty: number; kind: "volume" | "weight"; raw: string }[] = [];
  const re = new RegExp(`${NUM}\\s*(ml|lít|lit|l|kg|gram|gr|g)${NOT_LETTER}`, "g");
  for (const m of t.matchAll(re)) {
    const v = num(m[1]);
    const u = m[2];
    if (!(v > 0)) continue;
    if (u === "g" && v < 10) continue; // "4G", "5G" (mạng di động)
    if (u === "l" && v > 50) continue; // "100L" thường là dung tích tủ/thùng, không phải lượng hàng
    const qty = u === "ml" ? v : u === "l" || u === "lít" || u === "lit" ? v * 1000 : u === "kg" ? v * 1000 : v;
    out.push({ qty, kind: u === "ml" || u === "l" || u === "lít" || u === "lit" ? "volume" : "weight", raw: m[0] });
  }
  return out;
}

function counts(t: string) {
  const out: { n: number; noun: string | null; pack: boolean }[] = [];
  const nouns = [...PIECES, ...PACKS].join("|");
  // Không dùng lookbehind (?<!…): Safari/iOS < 16.4 (trình duyệt trong app Facebook trên iPhone cũ) báo lỗi cú pháp
  // và làm trắng cả trang. Thay bằng bắt ký tự đứng trước (hoặc đầu chuỗi).
  for (const m of t.matchAll(new RegExp(`(?:^|[^\\d.,\\-/])(\\d{1,4})\\s*(${nouns})${NOT_LETTER}`, "g")))
    out.push({ n: Number(m[1]), noun: m[2], pack: PACKS.includes(m[2]) });
  for (const m of t.matchAll(new RegExp(`(?:combo|set|lốc|pack)\\s*(\\d{1,3})(?![\\d.,\\-/x])`, "g")))
    out.push({ n: Number(m[1]), noun: null, pack: true });
  return out.filter((c) => c.n >= 1);
}

/** Đọc số lượng từ tên; null khi không chắc */
export function parseUnit(name: string): UnitInfo | null {
  const t = name.normalize("NFC").toLowerCase();
  // Danh sách lựa chọn kiểu "combo 3,4,5" / "3-4-5 đôi": không biết giá ứng với số nào
  if (/(combo|set|bộ)\s*\d+\s*[,/-]\s*\d+/.test(t) || /\d+\s*[,/-]\s*\d+\s*(đôi|cái|chiếc|miếng)/.test(t)) return null;

  // "500ml x 3", "3 x 500ml": nhân rõ ràng
  const mul = CONTAINER.test(t) ? null : t.match(new RegExp(`${NUM}\\s*(ml|l|lít|kg|g|gr)\\s*[x×*]\\s*(\\d{1,3})${NOT_LETTER}|(\\d{1,3})\\s*[x×*]\\s*${NUM}\\s*(ml|l|lít|kg|g|gr)${NOT_LETTER}`));
  if (mul) {
    const m = measures(mul[0])[0];
    const k = Number(mul[3] ?? mul[4]);
    if (m && k >= 1) return { qty: m.qty * k, kind: m.kind };
  }

  const ms = CONTAINER.test(t) ? [] : measures(t);
  const distinctM = [...new Set(ms.map((m) => `${m.kind}:${m.qty}`))];
  const cs = counts(t);
  const distinctC = [...new Set(cs.map((c) => c.n))];

  if (distinctM.length > 1) return null; // "10kg 20kg 30kg"
  if (distinctM.length === 1) {
    if (cs.some((c) => c.n > 1)) {
      // Có cả khối lượng và số gói/hũ: không rõ là mỗi gói hay tổng -> chỉ tính theo gói nếu số gói rõ ràng
      if (distinctC.length === 1) {
        const c = cs.find((x) => x.noun) ?? cs[0];
        return { qty: distinctC[0], kind: "count", noun: c.noun ?? undefined };
      }
      return null;
    }
    return { qty: ms[0].qty, kind: ms[0].kind };
  }
  if (distinctC.length === 1 && distinctC[0] >= 2) {
    const withNoun = cs.filter((c) => c.noun);
    const nounSet = new Set(withNoun.map((c) => c.noun));
    if (nounSet.size > 1) return null; // "10 bịch 1280 tờ" đã loại vì 2 số khác nhau; 2 danh từ cùng số cũng không chắc
    return { qty: distinctC[0], kind: "count", noun: withNoun[0]?.noun ?? undefined };
  }
  return null;
}

const fmtQty = (v: number) => (Math.round(v * 100) / 100).toString().replace(".", ",");

/** Giá theo đơn vị; null khi không đọc chắc số lượng hoặc chỉ có 1 cái/1 đơn vị nhỏ (không có ích) */
export function unitPrice(name: string, price: number): UnitPrice | null {
  const u = parseUnit(name);
  if (!u || !(price > 0)) return null;
  if (u.kind === "count") {
    const noun = u.noun ?? "món";
    return { per: price / u.qty, label: noun, qtyText: `${u.qty} ${noun}`, compareKey: `count:${noun}` };
  }
  const big = u.qty >= 1000;
  const small = u.qty <= 100;
  if (u.kind === "volume") {
    if (small) return { per: price / u.qty, label: "ml", qtyText: `${fmtQty(u.qty)}ml`, compareKey: "volume" };
    return big
      ? { per: price / (u.qty / 1000), label: "lít", qtyText: `${fmtQty(u.qty / 1000)} lít`, compareKey: "volume" }
      : { per: price / (u.qty / 100), label: "100ml", qtyText: `${fmtQty(u.qty)}ml`, compareKey: "volume" };
  }
  if (small) return { per: price / u.qty, label: "g", qtyText: `${fmtQty(u.qty)}g`, compareKey: "weight" };
  return big
    ? { per: price / (u.qty / 1000), label: "kg", qtyText: `${fmtQty(u.qty / 1000)}kg`, compareKey: "weight" }
    : { per: price / (u.qty / 100), label: "100g", qtyText: `${fmtQty(u.qty)}g`, compareKey: "weight" };
}

/** Quy về cùng một thang để so sánh (đ/ml, đ/g, đ/cái) */
export function perBase(u: UnitPrice) {
  if (u.label === "lít" || u.label === "kg") return u.per / 1000;
  if (u.label === "100ml" || u.label === "100g") return u.per / 100;
  if (u.label === "ml" || u.label === "g") return u.per;
  return u.per;
}

/** "≈ 87.700 đ/lít" */
export function unitPriceText(u: UnitPrice) {
  const v = u.per >= 1000 ? Math.round(u.per / 100) * 100 : Math.round(u.per);
  return `≈ ${v.toLocaleString("vi-VN")}đ/${u.label}`;
}

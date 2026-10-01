/**
 * Tóm tắt đánh giá tiếng Việt không cần AI: tìm các khía cạnh người mua nhắc tới (chất lượng, size, giao hàng…),
 * xác định khen/chê theo từ ngữ trong câu (có xử lý phủ định "không tốt", "không lỗi") và số sao của đánh giá,
 * rồi rút ra điểm được khen / bị chê và các dấu hiệu rủi ro.
 * Thuần (không DB) để kiểm thử dễ. Nhiều đánh giá viết không dấu nên mỗi từ khoá so cả bản không dấu
 * khi chính đánh giá đó không có dấu.
 */

export interface ReviewLike {
  rating: number;
  body: string;
  postedAt?: Date | null;
  observedAt?: Date | null;
  hasMedia?: boolean;
}

export type Level = "high" | "medium" | "low";
export interface Flag {
  key: string;
  level: Level;
  title: string;
  detail: string;
}

export interface AspectStat {
  key: string;
  label: string;
  con: string;
  pos: number;
  neg: number;
  /** Một câu ngắn minh hoạ (khen hoặc chê, theo chiều trội) */
  example?: string;
}

export interface ReviewSummary {
  count: number;
  withText: number;
  avg: number | null;
  /** Số đánh giá theo sao [1★..5★] trong mẫu đã thu */
  dist: number[];
  aspects: AspectStat[];
  pros: string[];
  cons: string[];
  /** Câu tóm tắt dựng từ khía cạnh (dùng khi chưa có tóm tắt AI) */
  headline: string;
  flags: Flag[];
}

/** Chữ thường, bỏ dấu, đ -> d */
export function stripVi(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}
const hasDiacritics = (s: string) => /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(s);

/** Bỏ dấu thì trùng nghĩa khác hẳn (chất/chật, hư/hú…): không so bản không dấu */
const AMBIGUOUS = new Set(["chat", "hu", "ma", "da", "gia", "lo", "cu", "ban", "bo", "mat", "tem", "vai", "mac", "mong", "hoi", "vo", "be", "kem", "do", "on", "em", "sang", "loi", "hong", "phai", "xu", "nhan", "cham", "tot cho"]);

type Matcher = (sentence: string, plain: string, accented: boolean) => boolean;

/** Từ khoá có dấu; khớp theo ranh giới từ. Câu không dấu thì so bản bỏ dấu (bỏ qua từ quá ngắn dễ nhầm). */
function kw(words: string[]): Matcher {
  const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${words.map(esc).join("|")})(?=$|[^\\p{L}\\p{N}])`, "u");
  const plainWords = words.map(stripVi).filter((w) => (w.length >= 3 || w.includes(" ")) && !AMBIGUOUS.has(w));
  const rePlain = plainWords.length ? new RegExp(`(^|[^a-z0-9])(${plainWords.map(esc).join("|")})(?=$|[^a-z0-9])`) : null;
  return (s, plain, accented) => re.test(s) || (!accented && !!rePlain && rePlain.test(plain));
}

/** label: tên khía cạnh (trung tính, cũng dùng cho điểm khen); con: cách nói khi bị chê */
const ASPECTS: { key: string; label: string; con: string; match: Matcher }[] = [
  { key: "quality", label: "Chất lượng", con: "Chất lượng chưa tốt", match: kw(["chất lượng", "chất vải", "vải", "chất liệu", "đường may", "hoàn thiện", "làm kỹ", "chắc chắn", "xịn", "chất lượng kém"]) },
  { key: "looks", label: "Kiểu dáng, màu sắc", con: "Kiểu dáng, màu sắc chưa đẹp", match: kw(["đẹp", "xinh", "màu", "màu sắc", "kiểu dáng", "thiết kế", "mẫu mã", "dễ thương", "sang"]) },
  { key: "asDescribed", label: "Giống mô tả", con: "Không giống mô tả", match: kw(["giống hình", "giống ảnh", "giống mô tả", "đúng mô tả", "như hình", "như ảnh", "khác hình", "khác ảnh", "không giống", "sai màu", "sai mẫu", "đúng hình"]) },
  { key: "size", label: "Kích cỡ, form", con: "Kích cỡ, form chưa chuẩn", match: kw(["size", "kích cỡ", "kích thước", "form", "chật", "rộng", "vừa vặn", "ôm", "nhỏ hơn", "to hơn", "dài", "ngắn"]) },
  { key: "packing", label: "Đóng gói", con: "Đóng gói sơ sài", match: kw(["đóng gói", "gói hàng", "gói kỹ", "hộp", "bọc", "móp", "bể", "vỡ", "chống sốc"]) },
  { key: "shipping", label: "Giao hàng", con: "Giao hàng chậm", match: kw(["giao hàng", "giao nhanh", "giao chậm", "ship", "shipper", "vận chuyển", "nhận hàng", "giao"]) },
  { key: "price", label: "Giá cả", con: "Giá chưa xứng", match: kw(["giá", "đáng tiền", "đáng giá", "rẻ", "hời", "mắc", "đắt", "phí tiền", "tiền nào của nấy"]) },
  { key: "durability", label: "Độ bền", con: "Nhanh hỏng", match: kw(["bền", "hư", "hỏng", "rách", "bung", "gãy", "lỗi", "phai", "xù", "dùng được", "sau 1 tuần", "sau một tuần"]) },
  { key: "service", label: "Shop, tư vấn", con: "Shop hỗ trợ chưa tốt", match: kw(["shop", "tư vấn", "phản hồi", "nhiệt tình", "chăm sóc", "đổi trả", "hỗ trợ", "seller"]) },
  { key: "authentic", label: "Chính hãng", con: "Nghi không chính hãng", match: kw(["chính hãng", "auth", "hàng thật", "hàng giả", "fake", "nhái", "tem", "check mã", "real", "hàng chuẩn"]) },
  { key: "battery", label: "Pin, sạc", con: "Pin yếu", match: kw(["pin", "sạc", "sạc nhanh", "hết pin"]) },
  { key: "sound", label: "Âm thanh", con: "Âm thanh chưa tốt", match: kw(["âm thanh", "âm bass", "bass", "loa", "mic", "rè", "tiếng"]) },
  { key: "smell", label: "Mùi hương", con: "Mùi chưa dễ chịu", match: kw(["mùi", "thơm", "hôi", "mùi hắc"]) },
  { key: "skin", label: "Hợp da", con: "Gây kích ứng da", match: kw(["làn da", "da mặt", "da dầu", "da khô", "da nhạy cảm", "kích ứng", "nổi mụn", "dịu nhẹ", "ẩm", "khô da", "thấm"]) },
];

const POS = kw([
  "tốt", "đẹp", "ổn", "ok", "oke", "okela", "ưng", "ưng ý", "thích", "xịn", "chuẩn", "nhanh", "đáng tiền", "đáng mua", "chắc chắn", "êm", "thơm",
  "rẻ", "hài lòng", "tuyệt", "tuyệt vời", "mịn", "vừa vặn", "mặc vừa", "vừa chân", "vừa size", "giống hình", "giống ảnh", "đúng mô tả", "như hình", "cẩn thận", "kỹ", "nhiệt tình",
  "bền", "chính hãng", "hời", "xinh", "dễ thương", "mát", "sang", "5 sao", "recommend", "nên mua", "rất được", "tạm ổn",
]);
const NEG = kw([
  "tệ", "kém", "xấu", "dở", "chán", "thất vọng", "lỗi", "hỏng", "hư", "rách", "bung", "chậm", "giao lâu", "đợi lâu", "lâu quá", "mỏng", "chật", "móp", "bể", "vỡ", "sai",
  "thiếu", "không giống", "khác hình", "khác ảnh", "giả", "fake", "nhái", "hôi", "đắt", "mắc", "phí tiền", "không đáng", "cũ", "bẩn", "dơ", "ẩu",
  "kích ứng", "nổi mụn", "lừa", "lừa đảo", "đừng mua", "không nên mua", "1 sao", "rè", "phai", "xù", "nhăn", "không như",
]);
const NEGATION = /(^|\s)(không|ko|k|hông|chẳng|chả|chưa|đâu có|không hề|ko hề)\s+(\S+\s+)?$/;

/**
 * Điểm khen/chê của một câu: +1 mỗi từ khen, −1 mỗi từ chê; "không/chưa/chẳng" ngay trước (≤2 từ) thì đảo chiều.
 * Kiểm theo từng cụm từ để xử lý phủ định ("không đẹp" = chê, "không lỗi" = khen).
 */
export function sentencePolarity(sentence: string): number {
  const s = sentence.toLowerCase();
  const accented = hasDiacritics(s);
  const tokens = s.split(/\s+/).filter(Boolean);
  let score = 0;
  const seen = new Set<number>();
  // Duyệt cụm 3 → 1 từ để cụm dài ("không giống", "đáng tiền") được tính trước từ đơn
  for (const n of [3, 2, 1]) {
    for (let i = 0; i + n <= tokens.length; i++) {
      if ([...Array(n).keys()].some((k) => seen.has(i + k))) continue;
      const phrase = tokens.slice(i, i + n).join(" ").replace(/[^\p{L}\p{N}\s]/gu, "");
      if (!phrase) continue;
      const plain = stripVi(phrase);
      const acc = accented && hasDiacritics(phrase); // câu lẫn có dấu/không dấu: xét theo chính cụm từ
      const isNeg = matchesWhole(NEG, phrase, plain, acc);
      const isPos = !isNeg && matchesWhole(POS, phrase, plain, acc);
      if (!isNeg && !isPos) continue;
      for (let k = 0; k < n; k++) seen.add(i + k);
      const before = tokens.slice(Math.max(0, i - 3), i).join(" ") + " ";
      // "không" là một phần của cụm chê ("không giống", "không đáng") thì không đảo
      const negated = !/^(không|ko|chẳng|chưa)\b/.test(phrase) && NEGATION.test(before);
      const v = isNeg ? -1 : 1;
      score += negated ? -v : v;
    }
  }
  return score;
}

/** Cụm phải khớp trọn (không phải chứa) để tránh "tốt" khớp trong "không tốt" khi đang xét cụm 2 từ */
function matchesWhole(m: Matcher, phrase: string, plain: string, accented: boolean) {
  return m(phrase, plain, accented) && wholeHit(m, phrase, plain, accented);
}
function wholeHit(m: Matcher, phrase: string, plain: string, accented: boolean) {
  // Bỏ từ đầu hoặc cuối mà vẫn khớp -> cụm ngắn hơn đã đủ, để vòng sau xử lý
  const w = phrase.split(" ");
  if (w.length === 1) return true;
  const a = w.slice(1).join(" "), b = w.slice(0, -1).join(" ");
  return !(m(a, stripVi(a), accented) || m(b, stripVi(b), accented));
}

function sentences(body: string): string[] {
  return body
    .split(/[.!?\n;]+|,?\s+(?:nhưng|nhung|mà|tuy nhiên|tuy nhien|có điều|co dieu)\s+/i)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
}

// ---- Dấu hiệu rủi ro trong nội dung ----
const FAKE = kw(["hàng giả", "hàng fake", "fake", "hàng nhái", "nhái", "không chính hãng", "ko chính hãng", "hàng dỏm", "dỏm", "không phải hàng thật", "hàng lô", "replica", "rep 1:1"]);
const NOT_FAKE = /(không|ko|chẳng|đâu)\s+(phải\s+)?(hàng\s+)?(giả|fake|nhái|dỏm)/i;
const NOT_AS_DESC = kw(["không giống hình", "không giống ảnh", "không giống mô tả", "khác hình", "khác ảnh", "khác mô tả", "không như hình", "không như ảnh", "sai màu", "sai mẫu", "không đúng mô tả", "không giống"]);
const WRONG_ITEM = kw(["giao sai", "giao nhầm", "gửi sai", "gửi nhầm", "giao thiếu", "thiếu hàng", "gửi thiếu", "thiếu phụ kiện", "không đủ", "hộp rỗng"]);
const USED = kw(["hàng cũ", "đã qua sử dụng", "đồ cũ", "bị trầy", "trầy xước", "có vết", "hàng trưng bày", "hàng bị lỗi"]);
const SCAM = kw(["lừa đảo", "lừa", "scam", "không nhận được hàng"]);

const has = (m: Matcher, body: string) => {
  const s = body.toLowerCase();
  return m(s, stripVi(s), hasDiacritics(s));
};
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const DAY = 86_400_000;

export function analyzeReviews(reviews: ReviewLike[], opts: { platformRating?: number | null; now?: Date } = {}): ReviewSummary {
  const now = opts.now ?? new Date();
  const dist = [0, 0, 0, 0, 0];
  for (const r of reviews) if (r.rating >= 1 && r.rating <= 5) dist[r.rating - 1]++;
  const count = dist.reduce((a, b) => a + b, 0);
  const avg = count ? Math.round((dist.reduce((s, n, i) => s + n * (i + 1), 0) / count) * 10) / 10 : null;
  const texts = reviews.filter((r) => r.body.trim().length >= 3);

  // ---- Khía cạnh ----
  const stats = new Map<string, AspectStat & { posEx?: string; negEx?: string }>();
  for (const r of texts) {
    const counted = new Set<string>(); // mỗi đánh giá chỉ tính 1 lần cho mỗi khía cạnh
    for (const sen of sentences(r.body)) {
      const low = sen.toLowerCase();
      const plain = stripVi(low);
      const accented = hasDiacritics(low);
      const hits = ASPECTS.filter((a) => a.match(low, plain, accented));
      if (!hits.length) continue;
      let pol = sentencePolarity(sen);
      if (pol === 0) pol = r.rating >= 4 ? 1 : r.rating <= 2 ? -1 : 0;
      // Đánh giá 1–2★ mà câu nghe "khen" thường là mỉa / khen phụ: không tính là khen
      if (pol > 0 && r.rating <= 2) pol = 0;
      if (pol === 0) continue;
      for (const a of hits) {
        if (counted.has(a.key)) continue;
        counted.add(a.key);
        const st = stats.get(a.key) ?? { key: a.key, label: a.label, con: a.con, pos: 0, neg: 0 };
        const ex = sen.length >= 8 && sen.length <= 120 ? sen : undefined;
        if (pol > 0) { st.pos++; st.posEx ??= ex; } else { st.neg++; st.negEx ??= ex; }
        stats.set(a.key, st);
      }
    }
  }
  const aspects: AspectStat[] = [...stats.values()]
    .map(({ posEx, negEx, ...a }) => ({ ...a, example: a.neg > a.pos ? negEx ?? posEx : posEx ?? negEx }))
    .sort((a, b) => b.pos + b.neg - (a.pos + a.neg));
  const minMentions = Math.max(2, Math.round(texts.length * 0.05));
  const pros = aspects.filter((a) => a.pos >= minMentions && a.pos / (a.pos + a.neg) >= 0.7).slice(0, 4).map((a) => a.label);
  const cons = aspects
    .filter((a) => a.neg >= minMentions && a.neg / (a.pos + a.neg) >= 0.35)
    .sort((a, b) => b.neg - a.neg)
    .slice(0, 4)
    .map((a) => a.con);

  // ---- Dấu hiệu rủi ro từ đánh giá ----
  const flags: Flag[] = [];
  const n = texts.length;
  const fake = texts.filter((r) => has(FAKE, r.body) && !NOT_FAKE.test(r.body)).length;
  if (fake >= 2 && pct(fake, n) >= 5) {
    flags.push({ key: "fake", level: "high", title: "Có người mua nghi hàng giả, hàng nhái", detail: `${fake}/${n} đánh giá có nội dung nhắc tới hàng giả hoặc hàng nhái.` });
  }
  const scam = texts.filter((r) => r.rating <= 2 && has(SCAM, r.body)).length;
  if (scam >= 2 && pct(scam, n) >= 4) {
    flags.push({ key: "scam", level: "high", title: "Có người mua phản ánh bị lừa hoặc không nhận được hàng", detail: `${scam}/${n} đánh giá 1–2★ phản ánh việc này.` });
  }
  const notDesc = texts.filter((r) => r.rating <= 3 && has(NOT_AS_DESC, r.body)).length;
  if (notDesc >= 3 && pct(notDesc, n) >= 8) {
    flags.push({ key: "notDescribed", level: "medium", title: "Hàng nhận được khác hình, khác mô tả", detail: `${notDesc}/${n} đánh giá phản ánh hàng không giống hình hoặc mô tả.` });
  }
  const wrong = texts.filter((r) => r.rating <= 3 && has(WRONG_ITEM, r.body)).length;
  if (wrong >= 3 && pct(wrong, n) >= 6) {
    flags.push({ key: "wrongItem", level: "medium", title: "Hay giao sai hoặc giao thiếu", detail: `${wrong}/${n} đánh giá phản ánh giao sai mẫu, sai phân loại hoặc thiếu hàng.` });
  }
  const used = texts.filter((r) => r.rating <= 3 && has(USED, r.body)).length;
  if (used >= 2 && pct(used, n) >= 5) {
    flags.push({ key: "used", level: "medium", title: "Có phản ánh hàng cũ, trầy xước", detail: `${used}/${n} đánh giá nhắc tới hàng cũ, đã qua sử dụng hoặc bị trầy.` });
  }
  const low = dist[0] + dist[1];
  if (count >= 10 && pct(low, count) >= 25) {
    flags.push({ key: "lowStars", level: pct(low, count) >= 40 ? "high" : "medium", title: "Nhiều đánh giá 1–2 sao", detail: `${pct(low, count)}% trong ${count} đánh giá Săn Deal thu được là 1–2★.` });
  }
  // Gần đây xấu đi: 30 ngày qua tỉ lệ 1–2★ cao hơn hẳn trước đó
  const when = (r: ReviewLike) => (r.postedAt ?? r.observedAt)?.getTime() ?? 0;
  const recent = reviews.filter((r) => now.getTime() - when(r) <= 30 * DAY);
  const older = reviews.filter((r) => now.getTime() - when(r) > 30 * DAY);
  const lowShare = (xs: ReviewLike[]) => (xs.length ? xs.filter((r) => r.rating <= 2).length / xs.length : 0);
  if (recent.length >= 8 && older.length >= 8 && lowShare(recent) - lowShare(older) >= 0.15 && !flags.some((f) => f.key === "lowStars")) {
    flags.push({ key: "worse", level: "medium", title: "Đánh giá gần đây xấu đi", detail: `30 ngày qua ${Math.round(lowShare(recent) * 100)}% đánh giá là 1–2★, trước đó chỉ ${Math.round(lowShare(older) * 100)}%.` });
  }
  // Điểm sàn hiển thị cao nhưng mẫu thu được thấp hơn nhiều
  if (opts.platformRating && opts.platformRating >= 4.6 && avg != null && count >= 10 && avg <= opts.platformRating - 0.8) {
    flags.push({ key: "ratingGap", level: "medium", title: "Điểm sao trên sàn cao hơn hẳn các đánh giá đọc được", detail: `Sàn hiện ${opts.platformRating.toFixed(1)}★ nhưng ${count} đánh giá Săn Deal thu được chỉ trung bình ${avg.toFixed(1)}★.` });
  }
  // Nhiều đánh giá 5★ quá ngắn hoặc trùng nhau: khó dựa vào để đánh giá
  const five = reviews.filter((r) => r.rating === 5);
  if (five.length >= 10) {
    const keyOf = (b: string) => stripVi(b).replace(/[^a-z0-9]/g, "");
    const freq = new Map<string, number>();
    for (const r of five) if (keyOf(r.body)) freq.set(keyOf(r.body), (freq.get(keyOf(r.body)) ?? 0) + 1);
    const dup = [...freq.values()].filter((c) => c >= 2).reduce((a, b) => a + b, 0);
    const short = five.filter((r) => keyOf(r.body).length < 12).length;
    if (pct(dup, five.length) >= 30 || pct(short, five.length) >= 70) {
      flags.push({ key: "thin5", level: "low", title: "Nhiều đánh giá 5★ rất ngắn hoặc giống hệt nhau", detail: "Nên đọc kỹ các đánh giá có ảnh, video và đánh giá 3★ trở xuống trước khi tin điểm sao." });
    }
  }

  return { count, withText: n, avg, dist, aspects: aspects.slice(0, 8), pros, cons, headline: headlineOf(pros, cons, count, avg), flags };
}

function joinVi(xs: string[]) {
  const l = xs.map((x) => x.toLowerCase());
  return l.length <= 1 ? l.join("") : `${l.slice(0, -1).join(", ")} và ${l[l.length - 1]}`;
}

export function headlineOf(pros: string[], cons: string[], count: number, avg: number | null): string {
  if (!count) return "";
  if (!pros.length && !cons.length) return `${count} đánh giá, trung bình ${avg?.toFixed(1)}★. Chưa đủ nội dung để rút ra điểm khen chê rõ ràng.`;
  const lc = (xs: string[]) => xs.map((x) => x.charAt(0).toLowerCase() + x.slice(1));
  const parts: string[] = [];
  if (pros.length) parts.push(`Người mua khen nhiều về ${joinVi(pros)}`);
  if (cons.length) parts.push(`${pros.length ? "một số người phàn nàn" : "Nhiều người phàn nàn"}: ${lc(cons).join(", ")}`);
  return parts.join("; ") + ".";
}

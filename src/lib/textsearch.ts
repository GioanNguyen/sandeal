/**
 * Tìm theo tên không phân biệt dấu: nhiều khách gõ không dấu ("quat mini") – trước đây không ra kết quả nào
 * vì tên sản phẩm có dấu ("Quạt mini"). Từ khoá có dấu thì vẫn so đúng dấu như cũ (chính xác hơn).
 */
import { ilike, sql, type AnyColumn, type SQL } from "drizzle-orm";

const GROUPS: [string, string][] = [
  ["àáạảãâầấậẩẫăằắặẳẵ", "a"],
  ["èéẹẻẽêềếệểễ", "e"],
  ["ìíịỉĩ", "i"],
  ["òóọỏõôồốộổỗơờớợởỡ", "o"],
  ["ùúụủũưừứựửữ", "u"],
  ["ỳýỵỷỹ", "y"],
  ["đ", "d"],
];
// Cả chữ hoa (lower() của Postgres có thể không hạ chữ hoa tiếng Việt tuỳ collation)
const FROM = GROUPS.map(([s]) => s + s.toUpperCase()).join("");
const TO = GROUPS.map(([s, t]) => t.repeat(s.length) + t.toUpperCase().repeat(s.length)).join("");

/** Từ khoá không có dấu tiếng Việt */
export const isUnaccented = (q: string) => q.normalize("NFD").replace(/[̀-ͯ]/g, "") === q.normalize("NFD") && !/[đĐ]/.test(q);

const esc = (s: string) => s.replace(/[%_\\]/g, (c) => `\\${c}`);

/** Bỏ dấu tiếng Việt trong JS (giống điều kiện SQL) */
export function stripVn(s: string) {
  let out = "";
  for (const ch of s.normalize("NFC")) {
    const i = FROM.indexOf(ch);
    out += i >= 0 ? TO[i] : ch;
  }
  return out;
}

/** Điều kiện "tên chứa từ khoá": có dấu thì so đúng dấu, không dấu thì so với tên đã bỏ dấu */
export function nameMatch(col: AnyColumn | SQL, q: string, mode: "contains" | "prefix" = "contains"): SQL {
  const term = q.normalize("NFC").trim();
  const pat = mode === "prefix" ? `${esc(term)}%` : `%${esc(term)}%`;
  if (!isUnaccented(term)) return ilike(col, pat);
  return sql`translate(${col}, ${FROM}, ${TO}) ilike ${pat}`;
}

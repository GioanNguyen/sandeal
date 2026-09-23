/** Ghép sản phẩm giống nhau giữa các sàn dựa trên tên (không cần mã vạch) */

const STOP = new Set(
  "chinh hang hang chinh hãng freeship free ship sale giam gia moi new hot sieu re gia re tot nhat loai 1 cao cap chat luong ban bao hanh tang kem qua sp san pham du lieu mau shop official mall store mua ngay deal voi cho va the"
    .split(" "),
);

function strip(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

/** "Nồi chiên không dầu 6 L (Chính hãng)" -> ["noi","chien","khong","dau","6l"] */
export function tokens(name: string): string[] {
  const s = strip(name)
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ") // bỏ phần trong ngoặc
    .replace(/(\d+(?:[.,]\d+)?)\s*(mah|ml|l|lit|g|kg|w|inch|gb|tb|mm|cm|m)\b/g, (_, n: string, u: string) => ` ${n.replace(",", ".")}${u === "lit" ? "l" : u} `);
  const out = s.split(/[^a-z0-9.]+/).map((t) => t.replace(/^\.+|\.+$/g, "")).filter((t) => t.length > 1 && !STOP.has(t));
  return [...new Set(out)];
}

const hasDigit = (t: string) => /\d/.test(t);

/** Độ giống nhau 0–1 (Jaccard). Nếu cả hai có thông số (số, dung lượng, model) mà không trùng -> 0 */
export function similarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const A = new Set(a), B = new Set(b);
  const numsA = a.filter(hasDigit), numsB = b.filter(hasDigit);
  if (numsA.length && numsB.length && !numsA.some((t) => B.has(t))) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export interface Item { id: number; platform: string; name: string }

/**
 * Gom nhóm các sản phẩm khác sàn có tên giống nhau (≥ threshold).
 * Trả về map id -> groupKey ("g<id nhỏ nhất>") cho các sản phẩm có ít nhất 1 bạn cùng nhóm ở sàn khác.
 */
export function groupItems(items: Item[], threshold = 0.6): Map<number, string> {
  const tok = new Map(items.map((i) => [i.id, tokens(i.name)]));
  const index = new Map<string, number[]>();
  for (const i of items) for (const t of tok.get(i.id)!) (index.get(t) ?? index.set(t, []).get(t)!).push(i.id);

  const parent = new Map(items.map((i) => [i.id, i.id]));
  const find = (x: number): number => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!));
  const byId = new Map(items.map((i) => [i.id, i]));

  for (const i of items) {
    const counts = new Map<number, number>();
    for (const t of tok.get(i.id)!) {
      const posting = index.get(t)!;
      if (posting.length > 500) continue; // từ quá phổ biến
      for (const j of posting) if (j > i.id && byId.get(j)!.platform !== i.platform) counts.set(j, (counts.get(j) ?? 0) + 1);
    }
    for (const [j, n] of counts) {
      if (n < 2) continue;
      if (similarity(tok.get(i.id)!, tok.get(j)!) >= threshold) {
        const a = find(i.id), b = find(j);
        if (a !== b) parent.set(Math.max(a, b), Math.min(a, b));
      }
    }
  }
  const groups = new Map<number, number[]>();
  for (const i of items) (groups.get(find(i.id)) ?? groups.set(find(i.id), []).get(find(i.id))!).push(i.id);
  const out = new Map<number, string>();
  for (const [root, ids] of groups) {
    const platforms = new Set(ids.map((id) => byId.get(id)!.platform));
    if (platforms.size >= 2) for (const id of ids) out.set(id, `g${root}`);
  }
  return out;
}

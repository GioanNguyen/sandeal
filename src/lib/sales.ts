/** Lịch các đợt sale lớn định kỳ trên sàn TMĐT Việt Nam (tính theo giờ Việt Nam, UTC+7) */
export interface SaleEvent {
  key: string; // YYYY-MM-DD
  name: string;
  kind: "double" | "payday" | "special";
  start: Date; // 00:00 giờ VN
  end: Date; // 23:59:59 giờ VN
  note: string;
}

const VN_OFFSET_MS = 7 * 3_600_000;
/** Mốc 00:00 giờ VN của ngày y-m-d */
const vnMidnight = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d) - VN_OFFSET_MS);
const pad = (n: number) => String(n).padStart(2, "0");

/** Ngày giờ hiện tại theo giờ VN (năm, tháng 1-12, ngày, giờ) */
export function vnParts(now: Date) {
  const t = new Date(now.getTime() + VN_OFFSET_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours() };
}

function lastFriday(y: number, m: number) {
  const last = new Date(Date.UTC(y, m, 0)); // ngày cuối tháng m
  const back = (last.getUTCDay() - 5 + 7) % 7;
  return last.getUTCDate() - back;
}

const DOUBLE_NAMES: Record<number, string> = {
  9: "Siêu sale 9.9",
  10: "Siêu sale 10.10",
  11: "Siêu sale 11.11 – lớn nhất năm",
  12: "Sale 12.12 cuối năm",
};

function eventsOfMonth(y: number, m: number): SaleEvent[] {
  const mk = (d: number, name: string, kind: SaleEvent["kind"], note: string): SaleEvent => ({
    key: `${y}-${pad(m)}-${pad(d)}`,
    name,
    kind,
    start: vnMidnight(y, m, d),
    end: new Date(vnMidnight(y, m, d + 1).getTime() - 1000),
    note,
  });
  const list: SaleEvent[] = [
    mk(m, DOUBLE_NAMES[m] ?? `Sale ngày đôi ${m}.${m}`, "double", "Mã giảm giá lớn, freeship, flash sale nhiều khung giờ"),
    mk(15, `Sale giữa tháng 15.${m}`, "payday", "Voucher giữa tháng, thường nhỏ hơn ngày đôi"),
    mk(25, `Sale ngày lương 25.${m}`, "payday", "Mã giảm theo ngày lương, hoàn xu"),
  ];
  if (m === 11) list.push(mk(lastFriday(y, 11), "Black Friday", "special", "Giảm sâu đồ điện tử, thời trang"));
  const seen = new Set<string>();
  return list.filter((e) => (seen.has(e.key) ? false : (seen.add(e.key), true)));
}

/** Các đợt sale từ hôm nay trở đi (gồm cả đợt đang diễn ra) */
export function upcomingSales(now = new Date(), count = 10): SaleEvent[] {
  const { y, m } = vnParts(now);
  const out: SaleEvent[] = [];
  for (let i = 0; i < 14 && out.length < count; i++) {
    const mm = ((m - 1 + i) % 12) + 1;
    const yy = y + Math.floor((m - 1 + i) / 12);
    out.push(...eventsOfMonth(yy, mm).filter((e) => e.end >= now));
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, count);
}

/** Đợt sale kế tiếp (ưu tiên ngày đôi / đặc biệt nếu `majorOnly`) */
export function nextSale(now = new Date(), majorOnly = false): SaleEvent {
  return upcomingSales(now, 12).find((e) => !majorOnly || e.kind !== "payday")!;
}

/** Đợt sale diễn ra vào ngày mai (giờ VN), dùng để nhắc tối hôm trước */
export function saleTomorrow(now = new Date()): SaleEvent | undefined {
  const tomorrow = new Date(now.getTime() + 86_400_000);
  const { y, m, d } = vnParts(tomorrow);
  const key = `${y}-${pad(m)}-${pad(d)}`;
  return upcomingSales(now, 6).find((e) => e.key === key);
}

/** Khung giờ flash sale thường gặp (có thể thay đổi theo sàn và từng đợt) */
export const FLASH_SLOTS = ["00:00", "09:00", "12:00", "15:00", "18:00", "21:00"];

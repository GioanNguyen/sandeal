/**
 * Báo cáo "Ai nâng giá trước sale?" dạng dễ trích dẫn: các phát hiện chính viết thành câu có số liệu, câu trích dẫn
 * gợi ý (nguồn + ngày số liệu + link), tệp CSV số liệu tổng hợp. Chỉ dùng số liệu tổng hợp (theo danh mục, shop, sàn),
 * không có dữ liệu cá nhân.
 */
import { GROUP_MIN, RAISE_PCT, type GroupRate, type raiseReport } from "./salepages";

type Report = Awaited<ReturnType<typeof raiseReport>>;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const dmy = (d: Date) => d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" });
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};

export const MIN_REPORT = 10;

export interface RaiseSummary {
  enough: boolean;
  /** Phát hiện chính, mỗi câu 1 con số */
  findings: string[];
  /** Câu trích dẫn gợi ý cho báo chí / bài viết */
  citation: string;
  /** Món tăng giá mà ngày sale vẫn không rẻ hơn giá cũ (chỉ đợt sale đã qua) */
  notCheaper: { n: number; of: number } | null;
  medianRise: number;
  asOf: Date;
}

export function raiseSummary(r: Report, o: { title: string; upcoming: boolean; url: string; host: string; now?: Date }): RaiseSummary {
  const asOf = o.now ?? new Date();
  const enough = r.total >= MIN_REPORT;
  const window = o.upcoming ? `trong 14 ngày qua (trước ${o.title})` : `trong 14 ngày trước ${o.title}`;
  const medianRise = median(r.raised.map((x) => x.peak / x.base - 1));
  const withSale = r.raised.filter((x) => x.saleLow != null);
  const notCheaper = !o.upcoming && withSale.length ? { n: withSale.filter((x) => x.saleLow! > x.base * 0.95).length, of: withSale.length } : null;
  const findings: string[] = [];
  if (enough) {
    findings.push(`${pct(r.rate)} trong ${r.total} sản phẩm Săn Deal theo dõi đã tăng giá từ ${Math.round(RAISE_PCT * 100)}% trở lên ${window}.`);
    if (r.raised.length >= 3) findings.push(`Mức tăng phổ biến (trung vị) của các món tăng giá: +${Math.round(medianRise * 100)}% so với giá thường ngày.`);
    if (notCheaper && notCheaper.of >= 3)
      findings.push(`${notCheaper.n}/${notCheaper.of} món đã tăng giá trước sale (${pct(notCheaper.n / notCheaper.of)}) không rẻ hơn giá cũ ngay cả trong ngày sale.`);
    const cats = r.byCategory.filter((c: GroupRate) => c.total >= GROUP_MIN).slice(0, 3);
    if (cats.length) findings.push(`Danh mục có tỉ lệ tăng giá cao nhất: ${cats.map((c) => `${c.label} (${pct(c.rate)}, ${c.raised}/${c.total} món)`).join("; ")}.`);
    const plats = r.byPlatform.filter((p: GroupRate) => p.total >= MIN_REPORT);
    if (plats.length > 1) findings.push(`Theo sàn: ${plats.map((p) => `${p.label} ${pct(p.rate)}`).join(", ")}.`);
  }
  const citation = enough
    ? `Theo số liệu của Săn Deal (${o.host}) cập nhật ngày ${dmy(asOf)}, ${pct(r.rate)} trong ${r.total} sản phẩm được theo dõi trên Shopee, Lazada, TikTok Shop đã tăng giá từ ${Math.round(RAISE_PCT * 100)}% trở lên ${window}. Nguồn: ${o.url}`
    : "";
  return { enough, findings, citation, notCheaper, medianRise, asOf };
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV số liệu tổng hợp (mở được bằng Excel / Google Sheets): tổng, theo sàn, theo danh mục, theo shop */
export function raiseCsv(r: Report, o: { title: string; url: string; now?: Date }): string {
  const rows: (string | number)[][] = [["nhom", "ten", "san", "so_mon_tang_gia", "tong_so_mon", "ti_le_phan_tram"]];
  rows.push(["tong", o.title, "", r.raised.length, r.total, r.total ? Math.round(r.rate * 1000) / 10 : 0]);
  const add = (group: string, list: GroupRate[]) => {
    for (const g of list) rows.push([group, g.label, g.platform ?? "", g.raised, g.total, Math.round(g.rate * 1000) / 10]);
  };
  add("san", r.byPlatform);
  add("danh_muc", r.byCategory);
  add("shop", r.byShop);
  const head = [
    `# Săn Deal – Ai nâng giá trước ${o.title}. Nguồn: ${o.url}`,
    `# Số liệu ngày ${dmy(o.now ?? new Date())}. "Tăng giá": giá cao nhất 14 ngày trước mốc cao hơn giá thường ngày (trung vị 14–30 ngày trước) từ ${Math.round(RAISE_PCT * 100)}%. Nhóm có từ ${GROUP_MIN} món.`,
  ];
  // BOM để Excel đọc đúng tiếng Việt
  return "﻿" + [...head, ...rows.map((r) => r.map(csvCell).join(","))].join("\n") + "\n";
}

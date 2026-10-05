/**
 * Google Search Console (tuỳ chọn): khách tìm gì trên Google mà thấy Săn Deal – số lần hiện, lượt bấm, vị trí.
 * Dùng tài khoản dịch vụ (service account) chỉ đọc, không cần đăng nhập Google trên máy chủ.
 *
 * .env:
 *   GSC_SITE          "sc-domain:sandealgiare.com" (thuộc tính Miền) hoặc "https://sandealgiare.com/"
 *   GSC_CLIENT_EMAIL  email của tài khoản dịch vụ (…@….iam.gserviceaccount.com)
 *   GSC_PRIVATE_KEY   private_key trong tệp JSON của tài khoản dịch vụ (giữ nguyên \n)
 */
import { createSign } from "node:crypto";

const HOUR = 3_600_000;
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export interface GscConfig {
  site: string;
  email: string;
  key: string;
}

export function gscConfig(env: Record<string, string | undefined> = process.env): GscConfig | null {
  const site = env.GSC_SITE?.trim();
  const email = env.GSC_CLIENT_EMAIL?.trim();
  const key = env.GSC_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  if (!site || !email || !key || !key.includes("PRIVATE KEY")) return null;
  return { site, email, key };
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/** JWT ký RS256 để đổi lấy access token (luồng tài khoản dịch vụ của Google) */
export function serviceJwt(c: GscConfig, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ iss: c.email, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 }));
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(c.key);
  return `${head}.${body}.${b64url(sig)}`;
}

async function accessToken(c: GscConfig, fetchImpl: typeof fetch) {
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: serviceJwt(c) }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string; error?: string };
  if (!res.ok || !j.access_token) throw new Error(`Google từ chối đăng nhập tài khoản dịch vụ: ${j.error_description ?? j.error ?? res.status}`);
  return j.access_token;
}

export interface GscRow {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export type GscKind = "near" | "lowctr";
export interface GscOpportunity extends GscRow {
  kind: GscKind;
}

const ymd = (d: Date) => new Date(d.getTime() + 7 * HOUR).toISOString().slice(0, 10);

// Số liệu Search Console chậm ~2 ngày và đổi chậm: giữ 6 giờ
const g = globalThis as unknown as { __gsc?: { at: number; days: number; rows: GscRow[] } };

export async function gscRows(days = 28, opts: { fetchImpl?: typeof fetch; now?: Date; fresh?: boolean } = {}): Promise<GscRow[]> {
  const c = gscConfig();
  if (!c) return [];
  const now = opts.now ?? new Date();
  if (!opts.fresh && g.__gsc && g.__gsc.days === days && now.getTime() - g.__gsc.at < 6 * HOUR) return g.__gsc.rows;
  const f = opts.fetchImpl ?? fetch;
  const token = await accessToken(c, f);
  const end = new Date(now.getTime() - 2 * 24 * HOUR);
  const start = new Date(end.getTime() - (days - 1) * 24 * HOUR);
  const res = await f(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(c.site)}/searchAnalytics/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ startDate: ymd(start), endDate: ymd(end), dimensions: ["query", "page"], rowLimit: 1000, dataState: "final" }),
    signal: AbortSignal.timeout(30_000),
  });
  const j = (await res.json().catch(() => ({}))) as { rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[]; error?: { message?: string } };
  if (!res.ok) {
    const msg = j.error?.message ?? `HTTP ${res.status}`;
    throw new Error(res.status === 403 ? `Tài khoản dịch vụ chưa được thêm vào Search Console (${msg})` : `Search Console: ${msg}`);
  }
  const rows = (j.rows ?? []).map((r) => ({ query: r.keys[0], page: r.keys[1], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));
  g.__gsc = { at: now.getTime(), days, rows };
  return rows;
}

/**
 * Cơ hội từ Search Console:
 *  - near: đang ở vị trí 5–20 (cuối trang 1 / trang 2) với đủ số lần hiện – bổ sung nội dung để lên top
 *  - lowctr: đã ở top 5 nhưng ít người bấm – tiêu đề/mô tả chưa hấp dẫn hoặc chưa đúng ý khách
 */
export function gscOpportunities(rows: GscRow[], limit = 30): GscOpportunity[] {
  const out: GscOpportunity[] = [];
  for (const r of rows) {
    if (r.position > 4.5 && r.position <= 20 && r.impressions >= 20) out.push({ ...r, kind: "near" });
    else if (r.position <= 4.5 && r.impressions >= 50 && r.ctr < 0.03) out.push({ ...r, kind: "lowctr" });
  }
  return out.sort((a, b) => b.impressions - a.impressions).slice(0, limit);
}

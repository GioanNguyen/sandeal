import { enabledAdapters } from "@/adapters";
import { closeDb, ensureMigrated } from "@/lib/db";
import { upsertProduct, upsertVoucher } from "@/lib/ingest";
import { notifyWatchers } from "./notify";
import { syncConversions } from "./conversions";
import { groupProducts } from "./grouping";
import { retryProductRequests } from "@/lib/lookup";

export { upsertProduct, upsertVoucher };

export interface SyncReport {
  products: number;
  vouchers: number;
  emails: number;
  groups: number;
  requests: number;
  conversions: number;
  errors: string[];
  ms: number;
}

export async function runSync(): Promise<SyncReport> {
  await ensureMigrated();
  const started = Date.now();
  const report: SyncReport = { products: 0, vouchers: 0, emails: 0, groups: 0, requests: 0, conversions: 0, errors: [], ms: 0 };
  for (const adapter of enabledAdapters()) {
    try {
      const ps = (await adapter.fetchProducts?.()) ?? [];
      for (const p of ps) await upsertProduct(p);
      const vs = (await adapter.fetchVouchers?.()) ?? [];
      for (const v of vs) await upsertVoucher(v);
      report.products += ps.length;
      report.vouchers += vs.length;
      console.log(`[sync] ${adapter.name}: ${ps.length} sản phẩm, ${vs.length} voucher`);
    } catch (err) {
      report.errors.push(`${adapter.name}: ${(err as Error).message}`);
      console.error(`[sync] ${adapter.name} lỗi:`, err);
    }
  }
  for (const [key, job] of [
    ["requests", () => retryProductRequests()],
    ["groups", groupProducts],
    ["emails", notifyWatchers],
    ["conversions", syncConversions],
  ] as const) {
    try {
      report[key] = await job();
    } catch (err) {
      report.errors.push(`${key}: ${(err as Error).message}`);
      console.error(`[sync] ${key} lỗi:`, err);
    }
  }
  report.ms = Date.now() - started;
  console.log(`[sync] xong`, report);
  return report;
}

// Chạy trực tiếp: npm run sync
if (process.argv[1]?.endsWith("sync.ts")) {
  runSync().then(closeDb).then(() => process.exit(0));
}

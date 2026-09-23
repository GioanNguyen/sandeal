import { accesstradeAdapter } from "./accesstrade";
import { mockAdapter } from "./mock";
import { shopeeAdapter } from "./shopee";
import type { SourceAdapter } from "./types";

const ALL: Record<string, SourceAdapter> = {
  mock: mockAdapter,
  shopee: shopeeAdapter,
  accesstrade: accesstradeAdapter,
  // lazada: lazadaAdapter,   // giai đoạn 3
  // tiktok: tiktokAdapter,   // giai đoạn 3
};

export function enabledAdapters(): SourceAdapter[] {
  return (process.env.SOURCES || "mock")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => ALL[s])
    .map((s) => ALL[s]);
}

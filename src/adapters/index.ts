import { accesstradeAdapter } from "./accesstrade";
import { lazadaAdapter } from "./lazada";
import { mockAdapter } from "./mock";
import { shopeeAdapter } from "./shopee";
import { tiktokAdapter } from "./tiktok";
import type { SourceAdapter } from "./types";

const ALL: Record<string, SourceAdapter> = {
  mock: mockAdapter,
  shopee: shopeeAdapter,
  lazada: lazadaAdapter,
  tiktok: tiktokAdapter,
  accesstrade: accesstradeAdapter,
};

export function enabledAdapters(): SourceAdapter[] {
  return (process.env.SOURCES || "mock")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => ALL[s])
    .map((s) => ALL[s]);
}

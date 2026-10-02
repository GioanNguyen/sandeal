"use client";
import { useReportWebVitals } from "next/web-vitals";

/**
 * Đo tốc độ tải trang trên máy người dùng thật (LCP, INP, CLS, FCP, TTFB) và gửi gom một lần khi người dùng
 * rời/ẩn trang (sendBeacon – không làm chậm trang). Chỉ gửi số đo, đường dẫn và loại thiết bị.
 */
type M = { name: string; value: number };
const queue: { name: string; value: number; path: string; device: string; net?: string }[] = [];
let sampled: boolean | null = null;
let listening = false;
const initialPath = typeof location !== "undefined" ? location.pathname : "/";

function flush() {
  if (!queue.length) return;
  const body = JSON.stringify({ metrics: queue.splice(0, 10) });
  try {
    if (!navigator.sendBeacon?.("/api/vitals", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/vitals", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
    }
  } catch {
    /* bỏ qua: đo tốc độ không được làm hỏng trang */
  }
  if (queue.length) flush();
}

const WANTED = new Set(["LCP", "INP", "CLS", "FCP", "TTFB"]);

function report(m: M) {
  if (!sampled || !WANTED.has(m.name)) return;
  const mobile = matchMedia("(max-width: 820px), (pointer: coarse)").matches;
  const net = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType;
  // Số đo lúc tải trang gắn với trang mở đầu; INP/CLS gắn với trang đang xem khi gửi
  const path = m.name === "LCP" || m.name === "FCP" || m.name === "TTFB" ? initialPath : location.pathname;
  queue.push({ name: m.name, value: m.value, path, device: mobile ? "mobile" : "desktop", net });
  if (!listening) {
    listening = true;
    addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
    addEventListener("pagehide", flush);
  }
  if (queue.length >= 10) flush();
}

export function WebVitals({ sample = 1 }: { sample?: number }) {
  if (sampled === null && typeof window !== "undefined") sampled = Math.random() < sample;
  useReportWebVitals(report);
  return null;
}

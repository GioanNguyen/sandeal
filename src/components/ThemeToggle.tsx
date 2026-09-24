"use client";
import { useEffect, useState } from "react";
import { THEME_KEY as KEY } from "@/lib/boot";

type Mode = "auto" | "light" | "dark";

const NEXT: Record<Mode, Mode> = { auto: "dark", dark: "light", light: "auto" };
const LABEL: Record<Mode, string> = { auto: "Giao diện: theo máy", dark: "Giao diện: tối", light: "Giao diện: sáng" };

function Glyph({ mode }: { mode: Mode }) {
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (mode === "dark") return <svg {...common}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>;
  if (mode === "light")
    return <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" /></svg>;
}

/** Nút đổi giao diện: theo máy → tối → sáng (nhớ trên trình duyệt này) */
export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("auto");
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setMode(t === "light" || t === "dark" ? t : "auto");
  }, []);
  const change = () => {
    const next = NEXT[mode];
    setMode(next);
    if (next === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch {}
    // Màu thanh trình duyệt trên điện thoại
    const dark = next === "dark" || (next === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", dark ? "#111215" : "#fff7f2"));
  };
  return (
    <button type="button" className="theme-toggle" onClick={change} aria-label={`${LABEL[mode]}. Bấm để đổi`}>
      <Glyph mode={mode} />
      <span>{LABEL[mode]}</span>
    </button>
  );
}

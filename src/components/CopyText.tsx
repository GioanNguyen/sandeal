"use client";
import { useState } from "react";
import { Icon } from "./Icon";

/** Nút chép một đoạn chữ (vd câu trích dẫn số liệu) */
export function CopyText({ text, label = "Chép câu trích dẫn" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {}
      }}
    >
      <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "Đã chép" : label}
      <span aria-live="polite" className="sr-only">{copied ? "Đã chép" : ""}</span>
    </button>
  );
}

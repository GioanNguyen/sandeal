"use client";
import { useState } from "react";
import { Icon } from "./Icon";

export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`code-btn${copied ? " copied" : ""}`}
      aria-label={copied ? `Đã chép mã ${code}` : `Chép mã ${code}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {}
      }}
    >
      <Icon name={copied ? "check" : "copy"} size={15} />
      {copied ? "Đã chép" : code}
      <span aria-live="polite" className="sr-only">{copied ? "Đã chép mã" : ""}</span>
    </button>
  );
}

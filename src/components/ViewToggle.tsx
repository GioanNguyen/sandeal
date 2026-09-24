"use client";
import { useEffect, useState } from "react";
import { VIEW_KEY } from "@/lib/boot";
import { Icon } from "./Icon";


/** Chuyển giữa dạng lưới (ảnh to) và dạng danh sách (gọn, lướt nhanh) – nhớ lựa chọn trên trình duyệt này */
export function ViewToggle() {
  const [view, setView] = useState<"grid" | "list">("grid");
  useEffect(() => {
    setView(document.documentElement.dataset.view === "list" ? "list" : "grid");
  }, []);
  const choose = (v: "grid" | "list") => {
    setView(v);
    if (v === "list") document.documentElement.dataset.view = "list";
    else delete document.documentElement.dataset.view;
    try { localStorage.setItem(VIEW_KEY, v); } catch {}
  };
  return (
    <div className="view-toggle" role="group" aria-label="Kiểu hiển thị">
      <button type="button" aria-pressed={view === "grid"} onClick={() => choose("grid")} title="Dạng lưới">
        <Icon name="grid" size={16} /><span>Lưới</span>
      </button>
      <button type="button" aria-pressed={view === "list"} onClick={() => choose("list")} title="Dạng danh sách">
        <Icon name="list" size={16} /><span>Danh sách</span>
      </button>
    </div>
  );
}

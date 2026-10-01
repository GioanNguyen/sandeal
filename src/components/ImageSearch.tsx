"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageMatch } from "@/lib/imagesearch";
import { reviveDeal } from "@/lib/local";
import { DealCard } from "./DealCard";
import { Icon } from "./Icon";

/** Vùng chọn trên ảnh, theo tỉ lệ 0–1 */
type Box = { x: number; y: number; w: number; h: number };
type Sort = "match" | "price";
type Show = "all" | "close";

const MAX_SIDE = 512; // mô hình chỉ cần ~224px; gửi 512px cho nhẹ mà vẫn đủ nét khi cắt vùng
const LABEL: Record<ImageMatch["match"], string> = { same: "Giống hệt", very: "Rất giống", similar: "Tương tự" };

/** Thu nhỏ (và cắt vùng nếu có) ngay trên máy người dùng rồi mới gửi: nhanh hơn trên 4G, không gửi ảnh gốc */
async function prepare(img: HTMLImageElement, box: Box | null): Promise<Blob> {
  const sx = box ? box.x * img.naturalWidth : 0;
  const sy = box ? box.y * img.naturalHeight : 0;
  const sw = box ? box.w * img.naturalWidth : img.naturalWidth;
  const sh = box ? box.h * img.naturalHeight : img.naturalHeight;
  const k = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(sw * k));
  c.height = Math.max(1, Math.round(sh * k));
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff"; // ảnh PNG trong suốt -> nền trắng như ảnh sản phẩm
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return new Promise((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error("canvas"))), "image/jpeg", 0.9));
}

export function ImageSearch({ indexed }: { indexed: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [drag, setDrag] = useState<Box | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<ImageMatch[] | null>(null);
  const [sort, setSort] = useState<Sort>("match");
  const [show, setShow] = useState<Show>("all");
  const [over, setOver] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const reqId = useRef(0);
  const resultsRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (b: Box | null) => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return;
    const id = ++reqId.current;
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("image", await prepare(img, b), "anh.jpg");
      const r = await fetch("/api/image-search", { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (id !== reqId.current) return; // đã có lần tìm mới hơn
      if (!r.ok) throw new Error(d.error || "Không tìm được, thử lại nhé.");
      setItems((d.items as ImageMatch[]).map(reviveDeal));
      setShow("all");
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) {
      if (id === reqId.current) setError((e as Error).message || "Không tìm được, thử lại nhé.");
    } finally {
      if (id === reqId.current) setBusy(false);
    }
  }, []);

  const pick = useCallback((file: File | Blob | null | undefined) => {
    if (!file) return;
    if (file.type && !file.type.startsWith("image/")) {
      setError("Đây không phải file ảnh.");
      return;
    }
    setError("");
    setItems(null);
    setBox(null);
    setSrc((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
  }, []);

  // Dán ảnh (Ctrl/Cmd+V) ở bất cứ đâu trên trang
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith("image/"));
      if (f) {
        e.preventDefault();
        pick(f);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [pick]);

  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);

  const pasteButton = async () => {
    try {
      const list = await navigator.clipboard.read();
      for (const it of list) {
        const type = it.types.find((t) => t.startsWith("image/"));
        if (type) return pick(await it.getType(type));
      }
      setError("Bộ nhớ tạm chưa có ảnh. Hãy chụp màn hình hoặc sao chép ảnh trước.");
    } catch {
      setError("Trình duyệt không cho đọc bộ nhớ tạm. Hãy nhấn Ctrl+V (hoặc giữ ô ảnh → Dán) nhé.");
    }
  };

  // ---- Kéo để chọn vùng ----
  const pos = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const onDown = (e: React.PointerEvent) => {
    if (busy) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = pos(e);
    setDrag(null);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const p = pos(e);
    const s = start.current;
    setDrag({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  };
  const onUp = () => {
    start.current = null;
    if (drag && drag.w > 0.06 && drag.h > 0.06) {
      setBox(drag);
      void search(drag);
    }
    setDrag(null);
  };
  const shown = drag ?? box;

  const list = (items ?? [])
    .filter((p) => show === "all" || p.match !== "similar")
    .sort((a, b) => (sort === "price" ? a.price - b.price : b.similarity - a.similarity));
  const closeCount = (items ?? []).filter((p) => p.match !== "similar").length;

  return (
    <div className="imgsearch">
      {!src ? (
        <div
          className={`img-drop${over ? " over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files?.[0]); }}
        >
          <span className="auth-icon"><Icon name="camera" size={26} /></span>
          <p><b>Kéo thả ảnh vào đây</b><br /><span className="muted">hoặc chụp màn hình sản phẩm trên TikTok, Facebook, Shopee… rồi dán (Ctrl+V)</span></p>
          <div className="img-actions">
            <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}>
              <Icon name="image" size={18} /> Chọn ảnh
            </button>
            <button type="button" className="btn btn-ghost" onClick={pasteButton}>
              <Icon name="copy" size={18} /> Dán ảnh
            </button>
          </div>
        </div>
      ) : (
        <div className="img-work">
          <div
            className={`img-stage${busy ? " busy" : ""}`}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => { start.current = null; setDrag(null); }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={src}
              alt="Ảnh bạn chọn để tìm"
              draggable={false}
              onLoad={() => void search(null)}
              onError={() => { setError("Không đọc được ảnh này (ảnh HEIC trên một số trình duyệt). Hãy chụp màn hình rồi dán, hoặc chọn ảnh JPG/PNG."); setSrc(null); }}
            />
            {shown && (
              <span
                className="img-box"
                style={{ left: `${shown.x * 100}%`, top: `${shown.y * 100}%`, width: `${shown.w * 100}%`, height: `${shown.h * 100}%` }}
                aria-hidden="true"
              />
            )}
            {busy && <span className="img-scan" aria-hidden="true" />}
          </div>
          <div className="img-side">
            <p className="img-tip">
              <Icon name="sparkles" size={16} />
              <span>
                {box ? "Đang tìm theo vùng đã khoanh." : "Ảnh có nhiều thứ? Kéo trên ảnh để khoanh đúng món cần tìm."}
              </span>
            </p>
            <div className="img-actions">
              {box && (
                <button type="button" className="btn btn-ghost" onClick={() => { setBox(null); void search(null); }} disabled={busy}>
                  Dùng cả ảnh
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
                <Icon name="image" size={18} /> Ảnh khác
              </button>
            </div>
            <p className="muted img-status" role="status" aria-live="polite">
              {busy ? "Đang nhận diện ảnh…" : items ? (items.length ? `Thấy ${items.length} món đang bán giống ảnh.` : "") : ""}
            </p>
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }}
      />

      {error && <p className="form-msg warn img-error" role="alert"><Icon name="alert" size={16} /> {error}</p>}

      <div ref={resultsRef} className="img-results">
        {items && items.length > 0 && (
          <>
            <div className="img-bar">
              <div className="chips" role="group" aria-label="Lọc theo độ giống">
                <button type="button" className="chip" aria-current={show === "all"} onClick={() => setShow("all")}>Tất cả <span className="muted">{items.length}</span></button>
                <button type="button" className="chip" aria-current={show === "close"} onClick={() => setShow("close")} disabled={!closeCount}>Rất giống <span className="muted">{closeCount}</span></button>
              </div>
              <label className="img-sort">
                <span className="sr-only">Sắp xếp</span>
                <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                  <option value="match">Giống nhất trước</option>
                  <option value="price">Rẻ nhất trước</option>
                </select>
              </label>
            </div>
            <div className="grid deal-grid">
              {list.map((p, i) => (
                <div key={p.id} className="img-hit">
                  <span className={`img-match m-${p.match}`}>{LABEL[p.match]} · {Math.round(p.similarity * 100)}%</span>
                  <DealCard p={p} priority={i < 4} />
                </div>
              ))}
            </div>
            <p className="muted img-note">
              Kết quả dựa trên hình ảnh nên có thể lẫn món na ná. Bấm vào món để xem lịch sử giá trước khi mua.
            </p>
          </>
        )}
        {items && items.length === 0 && !busy && (
          <div className="empty">
            <p><b>Chưa thấy món nào giống ảnh này</b> trong {indexed.toLocaleString("vi-VN")} món Săn Deal đang theo dõi.</p>
            <p>Thử khoanh sát sản phẩm hơn, hoặc tìm bằng tên.</p>
            <div className="img-actions" style={{ justifyContent: "center" }}>
              <Link className="btn btn-ghost" href="/kiem-tra-gia"><Icon name="link" size={16} /> Dán link sản phẩm</Link>
              <Link className="btn btn-ghost" href="/#deals"><Icon name="search" size={16} /> Tìm bằng chữ</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

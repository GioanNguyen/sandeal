"use client";
import { useState } from "react";
import { Icon } from "./Icon";
import { useSaved } from "./Saved";
import { ShareButtons } from "./ShareButtons";

type Item = { id: number; name: string; price: number };

/** Lưu tất cả món trong danh sách được chia sẻ vào "Đã lưu" của mình */
export function SaveAllButton({ items }: { items: Item[] }) {
  const { saveMany, isSaved } = useSaved();
  const [done, setDone] = useState(false);
  const all = items.length > 0 && items.every((x) => isSaved(x.id));
  return (
    <button
      type="button"
      className="btn btn-primary"
      disabled={!items.length || all || done}
      onClick={() => {
        saveMany(items).then(() => setDone(true));
      }}
    >
      <Icon name={all || done ? "check" : "heart"} size={16} /> {all || done ? "Đã lưu hết vào danh sách của bạn" : `Lưu cả ${items.length} món`}
    </button>
  );
}

/** Trên trang Đã lưu: chọn món, đặt tên, tạo link ngắn để gửi bạn bè */
export function ShareListPanel({ items }: { items: Item[] }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("Deal mình đã chọn");
  const [picked, setPicked] = useState<Set<number>>(() => new Set(items.slice(0, 30).map((x) => x.id)));
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!open)
    return (
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
        <Icon name="send" size={16} /> Chia sẻ danh sách
      </button>
    );

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, ids: [...picked] }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Không tạo được link");
      setUrl(d.url);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="share-list panel" aria-label="Chia sẻ danh sách">
      {url ? (
        <>
          <p className="share-list-ok"><Icon name="check" size={18} /> Đã tạo link cho “{title}” ({picked.size} món). Giá trong link luôn là giá mới nhất.</p>
          <input className="input" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Link danh sách" />
          <ShareButtons url={url} title={`${title} – ${picked.size} deal giảm thật`} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setUrl(null); setOpen(false); }}>Xong</button>
        </>
      ) : (
        <>
          <label className="field">
            <span>Tên danh sách</span>
            <input className="input" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="Ví dụ: Đồ cho bé tháng 10" />
          </label>
          <fieldset className="share-list-items">
            <legend>Chọn món ({picked.size}/{Math.min(items.length, 30)})</legend>
            {items.slice(0, 30).map((x) => (
              <label key={x.id}>
                <input
                  type="checkbox"
                  checked={picked.has(x.id)}
                  onChange={(e) => {
                    const n = new Set(picked);
                    if (e.target.checked) n.add(x.id);
                    else n.delete(x.id);
                    setPicked(n);
                  }}
                />
                <span>{x.name}</span>
              </label>
            ))}
          </fieldset>
          {err && <p className="form-error" role="alert">{err}</p>}
          <div className="hero-actions">
            <button type="button" className="btn btn-primary" onClick={create} disabled={busy || !picked.size}>
              <Icon name="link" size={16} /> {busy ? "Đang tạo…" : "Tạo link chia sẻ"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Huỷ</button>
          </div>
        </>
      )}
    </section>
  );
}

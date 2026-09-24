"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { PLATFORMS, vnd } from "@/lib/format";
import type { Suggestion } from "@/lib/discovery";
import { Icon } from "./Icon";

/** Tô đậm phần khớp từ khoá */
function Mark({ text, term }: { text: string; term: string }) {
  const i = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + term.length)}</mark>{text.slice(i + term.length)}</>;
}

/**
 * Ô tìm kiếm có gợi ý: gõ thì hiện sản phẩm kèm ảnh + giá, danh mục khớp; ô trống thì hiện từ khoá đang được tìm nhiều.
 * Nằm trong <Form action="/"> nên Enter không chọn gợi ý vẫn tìm như cũ.
 */
export function SearchBox() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Suggestion | null>(null);
  const [active, setActive] = useState(-1);
  const list = useRef<HTMLDivElement>(null);
  const cache = useRef(new Map<string, Suggestion>());
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const key = q.trim().toLowerCase();
    const hit = cache.current.get(key);
    if (hit) { setData(hit); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/suggest?q=${encodeURIComponent(key)}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((d: Suggestion) => { cache.current.set(key, d); setData(d); })
        .catch(() => {});
    }, key.length < 2 ? 0 : 150);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, open]);

  useEffect(() => setActive(-1), [data]);

  const options = () => Array.from(list.current?.querySelectorAll<HTMLAnchorElement>("[role=option]") ?? []);
  const term = q.trim();
  const hasProducts = !!data?.products.length;
  const show = open && !!data && (hasProducts || !!data.categories.length || !!data.trending.length || term.length >= 2);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { setOpen(false); return; }
    if (!show) return;
    const opts = options();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = opts.length;
      if (!n) return;
      setActive((a) => (e.key === "ArrowDown" ? (a + 1) % n : (a - 1 + n) % n));
    } else if (e.key === "Enter" && active >= 0 && opts[active]) {
      e.preventDefault();
      setOpen(false);
      opts[active].click(); // đi qua Link để có thanh tải trang
    }
  };

  useEffect(() => {
    options().forEach((el, i) => el.setAttribute("aria-selected", String(i === active)));
    options()[active]?.scrollIntoView({ block: "nearest" });
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  let idx = 0;
  const opt = () => `${id}-o${idx++}`;

  return (
    <>
      <Icon name="search" />
      <label htmlFor="q" className="sr-only">Tìm sản phẩm</label>
      <input
        id="q"
        name="q"
        type="search"
        autoComplete="off"
        placeholder="Tìm tai nghe, kem chống nắng, nồi chiên…"
        value={q}
        onChange={(e) => { setQ(e.target.value); setActive(-1); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKey}
        role="combobox"
        aria-expanded={show}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${id}-o${active}` : undefined}
      />
      {show && (
        <div className="suggest" id={`${id}-list`} role="listbox" ref={list} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(false)}>
          {term.length < 2 && data.trending.length > 0 && (
            <div className="sg-group">
              <p className="sg-title"><Icon name="flame" size={14} /> Đang được tìm nhiều</p>
              <div className="sg-chips">
                {data.trending.map((t) => (
                  <Link key={t.q} id={opt()} role="option" aria-selected="false" className="sg-chip" href={`/?q=${encodeURIComponent(t.q)}#deals`}>{t.q}</Link>
                ))}
              </div>
            </div>
          )}
          {hasProducts && (
            <div className="sg-group">
              <p className="sg-title">Sản phẩm</p>
              {data.products.map((p) => (
                <Link key={p.id} id={opt()} role="option" aria-selected="false" className="sg-product" href={`/product/${p.id}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.imageUrl ?? ""} alt="" width={44} height={44} loading="lazy" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                  <span className="sg-name"><span className="sg-n"><Mark text={p.name} term={term} /></span><small>{PLATFORMS[p.platform]?.label}</small></span>
                  <span className="sg-price"><b>{vnd(p.price)}</b>{p.realDropPct >= 5 && <small className="save">−{Math.round(p.realDropPct)}% thật</small>}</span>
                </Link>
              ))}
            </div>
          )}
          {data.categories.length > 0 && (
            <div className="sg-group">
              <p className="sg-title">{term.length < 2 ? "Danh mục" : "Danh mục khớp"}</p>
              <div className="sg-chips">
                {data.categories.map((c) => (
                  <Link key={c.slug} id={opt()} role="option" aria-selected="false" className="sg-chip" href={`/danh-muc/${c.slug}`}>{c.name} <span className="muted">{c.count}</span></Link>
                ))}
              </div>
            </div>
          )}
          {term.length >= 2 && (
            <Link id={opt()} role="option" aria-selected="false" className="sg-all" href={`/?q=${encodeURIComponent(term)}#deals`}>
              <Icon name="search" size={14} /> {hasProducts ? "Xem tất cả kết quả cho" : "Tìm"} “{term}”
            </Link>
          )}
        </div>
      )}
    </>
  );
}

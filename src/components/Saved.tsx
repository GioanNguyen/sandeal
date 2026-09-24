"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { readLocal, SAVED_KEY, SAVED_PRICE_KEY, SAVED_SEEN_KEY, savedDrops, writeLocal, type SavedPrices } from "@/lib/local";
import { Icon } from "./Icon";

export type Drop = { id: number; from: number; to: number };
interface Ctx {
  isSaved: (id: number) => boolean;
  toggle: (id: number, name: string, price?: number) => void;
  /** Chỉ lưu (không bỏ lưu) – dùng cho chế độ lướt deal */
  save: (id: number, name: string, price?: number) => void;
  loggedIn: boolean | null;
  ids: number[];
  /** Món đã lưu giảm giá kể từ lần cuối xem trang Đã lưu */
  drops: Drop[];
  /** Đã kiểm tra giá xong (drops đáng tin) */
  dropsReady: boolean;
  /** Đánh dấu đã xem các mức giá hiện tại (trang Đã lưu gọi) */
  markSeen: (prices: Record<string, number>) => void;
}
const SavedCtx = createContext<Ctx>({ isSaved: () => false, toggle: () => {}, save: () => {}, loggedIn: null, ids: [], drops: [], dropsReady: false, markSeen: () => {} });
export const useSaved = () => useContext(SavedCtx);

const rememberPrice = (id: number, price?: number) => {
  if (price == null) return;
  const m = readLocal<SavedPrices>(SAVED_PRICE_KEY, {});
  m[id] = { p: price, at: Date.now() };
  writeLocal(SAVED_PRICE_KEY, m);
};

type Toast = { text: string; action?: { href: string; label: string } } | null;

/**
 * Nút ♡ Lưu: đã đăng nhập thì lưu = theo dõi giá (báo khi giảm);
 * chưa đăng nhập thì lưu tạm trên trình duyệt và tự chuyển vào tài khoản sau khi đăng nhập.
 */
export function SavedProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<Set<number>>(new Set());
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [drops, setDrops] = useState<Drop[]>([]);
  const [dropsReady, setDropsReady] = useState(false);
  const checked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = (t: Toast) => {
    setToast(t);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 4500);
  };

  useEffect(() => {
    const local = readLocal<number[]>(SAVED_KEY, []);
    fetch("/api/saved")
      .then((r) => r.json())
      .then(async (d: { loggedIn: boolean; ids: number[] }) => {
        setLoggedIn(d.loggedIn);
        if (d.loggedIn && local.length) {
          await fetch("/api/saved/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: local }) }).catch(() => null);
          writeLocal(SAVED_KEY, []);
          setIds(new Set([...d.ids, ...local]));
          show({ text: `Đã chuyển ${local.length} sản phẩm đã lưu vào tài khoản. Bạn sẽ được báo khi giá giảm.` });
        } else setIds(new Set(d.loggedIn ? d.ids : local));
      })
      .catch(() => { setLoggedIn(false); setIds(new Set(local)); });
  }, []);

  // Kiểm tra giá các món đã lưu (1 lần mỗi lượt tải trang)
  useEffect(() => {
    if (loggedIn === null) return;
    if (!ids.size) { if (!checked.current) setDropsReady(true); return; }
    if (checked.current) return;
    checked.current = true;
    const list = [...ids];
    fetch(`/api/prices?ids=${list.slice(0, 100).join(",")}`)
      .then((r) => r.json())
      .then(({ prices }: { prices: Record<string, number> }) => {
        const saved = readLocal<SavedPrices>(SAVED_PRICE_KEY, {});
        // Món lưu từ thiết bị khác (chưa có mốc) -> lấy giá hiện tại làm mốc
        let changed = false;
        for (const id of list) if (!saved[id] && prices[id] != null) { saved[id] = { p: prices[id], at: Date.now() }; changed = true; }
        if (changed) writeLocal(SAVED_PRICE_KEY, saved);
        const d = savedDrops(list, prices, saved, readLocal<Record<string, number>>(SAVED_SEEN_KEY, {}));
        setDrops(d);
        setDropsReady(true);
        // Nhắc 1 lần mỗi phiên (không nhắc khi đang ở trang Đã lưu)
        let told = false;
        try { told = sessionStorage.getItem("sd-drops-told") === String(d.length); } catch {}
        if (d.length && !told && location.pathname !== "/da-luu") {
          show({ text: `${d.length} món bạn lưu vừa giảm giá.`, action: { href: "/da-luu", label: "Xem ngay" } });
          try { sessionStorage.setItem("sd-drops-told", String(d.length)); } catch {}
        }
      })
      .catch(() => setDropsReady(true));
  }, [ids, loggedIn]);

  const markSeen = useCallback((prices: Record<string, number>) => {
    const seen = readLocal<Record<string, number>>(SAVED_SEEN_KEY, {});
    for (const [id, p] of Object.entries(prices)) seen[id] = p;
    writeLocal(SAVED_SEEN_KEY, seen);
    setDrops([]);
  }, []);

  const toggle = useCallback(
    async (id: number, name: string, price?: number, onlySave = false) => {
      const was = ids.has(id);
      if (was && onlySave) return;
      if (!was) rememberPrice(id, price);
      const next = new Set(ids);
      if (was) next.delete(id);
      else next.add(id);
      setIds(next);
      if (!loggedIn) {
        writeLocal(SAVED_KEY, [...next]);
        if (onlySave) return; // chế độ lướt deal có bộ đếm riêng, không hiện thông báo mỗi lần
        show(was ? { text: "Đã bỏ lưu." } : { text: "Đã lưu trên trình duyệt này. Đăng nhập để được báo khi giá giảm.", action: { href: `/login?next=${encodeURIComponent(location.pathname)}`, label: "Đăng nhập" } });
        return;
      }
      const res = await fetch("/api/saved", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: id, save: onlySave || undefined }) }).catch(() => null);
      if (!res?.ok) {
        setIds(ids); // hoàn tác
        show({ text: "Không lưu được, thử lại sau." });
        return;
      }
      if (onlySave) return;
      show(was ? { text: "Đã bỏ theo dõi." } : { text: `Đã lưu “${name.slice(0, 40)}”. Sẽ báo bạn khi giá giảm.`, action: { href: "/account", label: "Xem danh sách" } });
    },
    [ids, loggedIn],
  );

  return (
    <SavedCtx.Provider
      value={{
        isSaved: (id) => ids.has(id),
        toggle: (id, name, price) => toggle(id, name, price),
        save: (id, name, price) => toggle(id, name, price, true),
        loggedIn,
        ids: [...ids],
        drops,
        dropsReady,
        markSeen,
      }}
    >
      {children}
      <div className={`toast${toast ? " show" : ""}`} role="status" aria-live="polite">
        {toast && (
          <>
            <span>{toast.text}</span>
            {toast.action && <Link href={toast.action.href} onClick={() => setToast(null)}>{toast.action.label}</Link>}
          </>
        )}
      </div>
    </SavedCtx.Provider>
  );
}

export function SaveButton({ id, name, price }: { id: number; name: string; price?: number }) {
  const { isSaved, toggle } = useContext(SavedCtx);
  const on = isSaved(id);
  const [pop, setPop] = useState(false);
  return (
    <button
      type="button"
      className={`save-btn${on ? " on" : ""}${pop ? " pop" : ""}`}
      aria-pressed={on}
      aria-label={on ? `Bỏ lưu ${name}` : `Lưu ${name} để được báo khi giảm giá`}
      title={on ? "Đã lưu – bấm để bỏ" : "Lưu & báo khi giảm giá"}
      onClick={() => {
        toggle(id, name, price);
        setPop(true);
        setTimeout(() => setPop(false), 350);
      }}
    >
      <Icon name={on ? "heartFill" : "heart"} size={18} />
    </button>
  );
}

/** Mục "Đã lưu" trên menu, có chấm đỏ đếm số món vừa giảm giá */
export function SavedNavLink() {
  const { ids, drops } = useContext(SavedCtx);
  const n = drops.length;
  return (
    <Link href="/da-luu" aria-label={n ? `Đã lưu – ${n} món vừa giảm giá` : `Đã lưu (${ids.length})`} className="nav-saved">
      <Icon name="heart" />
      <span>Đã lưu</span>
      {n > 0 && <b className="nav-dot" aria-hidden="true">{n > 9 ? "9+" : n}</b>}
    </Link>
  );
}

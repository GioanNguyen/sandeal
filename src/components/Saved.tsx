"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { readLocal, SAVED_KEY, writeLocal } from "@/lib/local";
import { Icon } from "./Icon";

interface Ctx { isSaved: (id: number) => boolean; toggle: (id: number, name: string) => void; loggedIn: boolean | null }
const SavedCtx = createContext<Ctx>({ isSaved: () => false, toggle: () => {}, loggedIn: null });

type Toast = { text: string; action?: { href: string; label: string } } | null;

/**
 * Nút ♡ Lưu: đã đăng nhập thì lưu = theo dõi giá (báo khi giảm);
 * chưa đăng nhập thì lưu tạm trên trình duyệt và tự chuyển vào tài khoản sau khi đăng nhập.
 */
export function SavedProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<Set<number>>(new Set());
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [toast, setToast] = useState<Toast>(null);
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
      .catch(() => setIds(new Set(local)));
  }, []);

  const toggle = useCallback(
    async (id: number, name: string) => {
      const was = ids.has(id);
      const next = new Set(ids);
      if (was) next.delete(id);
      else next.add(id);
      setIds(next);
      if (!loggedIn) {
        writeLocal(SAVED_KEY, [...next]);
        show(was ? { text: "Đã bỏ lưu." } : { text: "Đã lưu trên trình duyệt này. Đăng nhập để được báo khi giá giảm.", action: { href: `/login?next=${encodeURIComponent(location.pathname)}`, label: "Đăng nhập" } });
        return;
      }
      const res = await fetch("/api/saved", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: id }) }).catch(() => null);
      if (!res?.ok) {
        setIds(ids); // hoàn tác
        show({ text: "Không lưu được, thử lại sau." });
        return;
      }
      show(was ? { text: "Đã bỏ theo dõi." } : { text: `Đã lưu “${name.slice(0, 40)}”. Sẽ báo bạn khi giá giảm.`, action: { href: "/account", label: "Xem danh sách" } });
    },
    [ids, loggedIn],
  );

  return (
    <SavedCtx.Provider value={{ isSaved: (id) => ids.has(id), toggle, loggedIn }}>
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

export function SaveButton({ id, name }: { id: number; name: string }) {
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
        toggle(id, name);
        setPop(true);
        setTimeout(() => setPop(false), 350);
      }}
    >
      <Icon name={on ? "heartFill" : "heart"} size={18} />
    </button>
  );
}

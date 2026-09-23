"use client";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Đăng ký service worker + nút "Cài ứng dụng" (chỉ hiện khi trình duyệt cho phép cài) */
export function PwaInstall() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setEvt(null));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  if (!evt) return null;
  return (
    <button
      type="button"
      className="install-btn"
      onClick={async () => {
        await evt.prompt();
        await evt.userChoice.catch(() => null);
        setEvt(null);
      }}
    >
      <Icon name="download" size={16} /> Cài ứng dụng
    </button>
  );
}

const b64ToBytes = (b64: string) => {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

/** Bật/tắt thông báo đẩy trên thiết bị này */
export function PushToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<"loading" | "unsupported" | "denied" | "off" | "on" | "busy">("loading");
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    setIos(isIos && !standalone);
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
    if (Notification.permission === "denied") return setState("denied");
    navigator.serviceWorker.register("/sw.js").then((reg) => reg.pushManager.getSubscription()).then((sub) => setState(sub ? "on" : "off")).catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setState("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
      const res = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...sub.toJSON(), test: true }) });
      setState(res.ok ? "on" : "off");
    } catch {
      setState("off");
    }
  }
  async function disable() {
    setState("busy");
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
    setState("off");
  }

  if (state === "loading") return <p className="muted" style={{ fontSize: 14 }}>Đang kiểm tra…</p>;
  if (state === "unsupported")
    return (
      <p className="muted" style={{ fontSize: 14 }}>
        {ios
          ? "Trên iPhone/iPad: bấm nút Chia sẻ → “Thêm vào MH chính”, mở Săn Deal từ màn hình chính rồi bật thông báo tại đây."
          : "Trình duyệt này không hỗ trợ thông báo đẩy."}
      </p>
    );
  if (state === "denied") return <p className="muted" style={{ fontSize: 14 }}>Bạn đã chặn thông báo. Mở cài đặt trang web của trình duyệt để cho phép lại.</p>;
  return state === "on" ? (
    <div className="row" style={{ gap: 10 }}>
      <span className="real-drop"><Icon name="check" size={14} /> Đã bật trên thiết bị này</span>
      <button type="button" className="btn btn-ghost btn-sm" onClick={disable}>Tắt</button>
    </div>
  ) : (
    <button type="button" className="btn btn-primary" onClick={enable} disabled={state === "busy"}>
      <Icon name="bell" size={16} /> {state === "busy" ? "Đang bật…" : "Bật thông báo trên thiết bị này"}
    </button>
  );
}

"use client";
import { useEffect, useState } from "react";
import type { OnlineSummary } from "@/lib/presence";

/** Quản trị › Thống kê: người đang online (tự làm mới 15 giây/lần) */
export function OnlineNow({ initial }: { initial: OnlineSummary }) {
  const [d, setD] = useState(initial);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/admin/presence", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const j = (await res.json()) as OnlineSummary;
        if (!stop) {
          setD(j);
          setErr(false);
        }
      } catch {
        if (!stop) setErr(true);
      }
    };
    const t = setInterval(load, 15_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);
  const time = new Date(d.at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
  return (
    <section className="section panel" aria-labelledby="online-head" aria-live="polite">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <h2 id="online-head" style={{ margin: 0 }}>
          <span aria-hidden="true" style={{ display: "inline-block", width: 10, height: 10, borderRadius: 99, background: d.total ? "#1e9e5a" : "var(--muted)", marginRight: 8 }} />
          Đang online: {d.total.toLocaleString("vi-VN")} người
        </h2>
        <small className="muted">
          {d.total > 0 && <>📱 {d.mobile} điện thoại · 💻 {d.desktop} máy tính · </>}
          cập nhật {time}{err ? " · mất kết nối, đang thử lại" : ""}
        </small>
      </div>
      {d.total > 0 ? (
        <>
          {d.sources.length > 0 && (
            <p className="muted" style={{ fontSize: 14, margin: "8px 0" }}>
              Nguồn tới: {d.sources.map((s) => `${s.source} ${s.n}`).join(" · ")}
            </p>
          )}
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th scope="col">Trang đang xem</th><th scope="col" className="num">Số người</th></tr></thead>
              <tbody>
                {d.pages.slice(0, 30).map((p) => (
                  <tr key={p.path}>
                    <td style={{ wordBreak: "break-word" }}>
                      <a href={p.path} target="_blank" rel="noopener">{p.title || p.path}</a>
                      {p.title && <div className="muted" style={{ fontSize: 12.5, wordBreak: "break-all" }}>{p.path}</div>}
                    </td>
                    <td className="num">{p.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {d.pages.length > 30 && <p className="muted" style={{ fontSize: 13 }}>… và {d.pages.length - 30} trang khác</p>}
        </>
      ) : (
        <p className="muted" style={{ marginBottom: 0 }}>Chưa có khách nào đang xem.</p>
      )}
    </section>
  );
}

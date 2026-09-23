"use client";
import { useEffect, useMemo, useState } from "react";
import { PLATFORMS, vnd } from "@/lib/format";
import { bestPlan, voucherGain, type CalcVoucher } from "@/lib/voucher";
import { CopyCode } from "./CopyCode";
import { Icon } from "./Icon";

interface Item { key: string; name: string; price: number; qty: number }
const STORE = "sd-calc-v1";
const uid = () => Math.random().toString(36).slice(2, 9);

export function PriceCalculator({ vouchers, initial }: { vouchers: CalcVoucher[]; initial?: { platform: string; item: Omit<Item, "key"> } }) {
  const [platform, setPlatform] = useState(initial?.platform ?? "shopee");
  const [items, setItems] = useState<Item[]>(initial ? [{ key: uid(), ...initial.item }] : [{ key: uid(), name: "", price: 0, qty: 1 }]);
  const [shipping, setShipping] = useState(30_000);

  // Nhớ giỏ trên trình duyệt này (bỏ qua nếu mở từ trang sản phẩm)
  useEffect(() => {
    if (initial) return;
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? "null");
      if (saved?.items?.length) {
        setItems(saved.items);
        setPlatform(saved.platform ?? "shopee");
        setShipping(saved.shipping ?? 30_000);
      }
    } catch {}
  }, [initial]);
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ items, platform, shipping }));
    } catch {}
  }, [items, platform, shipping]);

  const subtotal = items.reduce((s, i) => s + (i.price || 0) * (i.qty || 0), 0);
  const cart = { platform, subtotal, shipping };
  const plan = useMemo(() => bestPlan(cart, vouchers), [platform, subtotal, shipping, vouchers]); // eslint-disable-line react-hooks/exhaustive-deps
  const forPlatform = vouchers.filter((v) => v.platform === platform);
  const almost = forPlatform
    .filter((v) => (v.minSpend ?? 0) > subtotal && subtotal > 0)
    .map((v) => ({ v, need: (v.minSpend ?? 0) - subtotal, gain: voucherGain(v, { ...cart, subtotal: v.minSpend ?? 0 }) }))
    .filter((x) => x.need <= subtotal * 0.5)
    .sort((a, b) => a.need - b.need)
    .slice(0, 3);
  const update = (key: string, patch: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const saved = subtotal + shipping - plan.effective;

  return (
    <div className="calc">
      <section className="panel stack">
        <h2><Icon name="calculator" /> Giỏ hàng của bạn</h2>
        <div className="chips" role="radiogroup" aria-label="Sàn">
          {Object.entries(PLATFORMS).map(([k, p]) => (
            <button key={k} type="button" role="radio" aria-checked={platform === k} className="chip" aria-current={platform === k} onClick={() => setPlatform(k)}>
              <span className="dot" style={{ background: p.color }} aria-hidden="true" /> {p.label}
            </button>
          ))}
        </div>
        <ul className="calc-items">
          {items.map((it, idx) => (
            <li key={it.key}>
              <div className="field grow">
                <label htmlFor={`n-${it.key}`}>Sản phẩm {idx + 1}</label>
                <input id={`n-${it.key}`} className="input" value={it.name} placeholder="Tên (không bắt buộc)" onChange={(e) => update(it.key, { name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor={`p-${it.key}`}>Giá (đ)</label>
                <input id={`p-${it.key}`} className="input" inputMode="numeric" value={it.price ? it.price.toLocaleString("vi-VN") : ""} placeholder="0"
                  onChange={(e) => update(it.key, { price: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
              </div>
              <div className="field qty">
                <label htmlFor={`q-${it.key}`}>SL</label>
                <input id={`q-${it.key}`} className="input" type="number" min={1} value={it.qty} onChange={(e) => update(it.key, { qty: Math.max(1, Number(e.target.value) || 1) })} />
              </div>
              <button type="button" className="btn btn-ghost icon-btn" aria-label={`Xoá sản phẩm ${idx + 1}`} onClick={() => setItems((xs) => (xs.length > 1 ? xs.filter((x) => x.key !== it.key) : xs))}>
                <Icon name="trash" size={16} />
              </button>
            </li>
          ))}
        </ul>
        <div className="row" style={{ gap: 12, justifyContent: "space-between" }}>
          <button type="button" className="btn btn-ghost" onClick={() => setItems((xs) => [...xs, { key: uid(), name: "", price: 0, qty: 1 }])}>+ Thêm sản phẩm</button>
          <div className="field">
            <label htmlFor="ship">Phí vận chuyển (đ)</label>
            <input id="ship" className="input" inputMode="numeric" value={shipping.toLocaleString("vi-VN")} onChange={(e) => setShipping(Number(e.target.value.replace(/\D/g, "")) || 0)} />
          </div>
        </div>
      </section>

      <section className="panel calc-result" aria-live="polite">
        <h2><Icon name="sparkles" /> Giá cuối cùng tốt nhất</h2>
        <dl className="bill">
          <div><dt>Tiền hàng</dt><dd>{vnd(subtotal)}</dd></div>
          <div><dt>Phí vận chuyển</dt><dd>{vnd(shipping)}</dd></div>
          {plan.discount > 0 && <div className="save"><dt>Mã giảm giá</dt><dd>−{vnd(plan.discount)}</dd></div>}
          {plan.shipSaved > 0 && <div className="save"><dt>Mã freeship</dt><dd>−{vnd(plan.shipSaved)}</dd></div>}
          <div className="total"><dt>Thanh toán</dt><dd>{vnd(plan.payNow)}</dd></div>
          {plan.cashback > 0 && <div className="save"><dt>Hoàn xu (nhận sau)</dt><dd>−{vnd(plan.cashback)}</dd></div>}
          {plan.cashback > 0 && <div className="total"><dt>Thực trả</dt><dd>{vnd(plan.effective)}</dd></div>}
        </dl>
        {subtotal > 0 && saved > 0 && <p className="real-drop" style={{ fontSize: 15 }}><Icon name="check" size={16} /> Tiết kiệm {vnd(saved)} nhờ dùng đúng mã</p>}
        {plan.vouchers.length > 0 ? (
          <>
            <h3>Dùng các mã này</h3>
            <ul className="plan-list">
              {plan.vouchers.map((v) => (
                <li key={v.id}>
                  <span>{v.title}</span>
                  {v.code ? <CopyCode code={v.code} /> : <a className="btn btn-ghost btn-sm" href={`/go/v/${v.id}`} target="_blank" rel="nofollow sponsored noopener">Lưu mã</a>}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="muted">{subtotal > 0 ? `Chưa có mã ${PLATFORMS[platform]?.label} nào dùng được cho giỏ này.` : "Nhập giá sản phẩm để tính."}</p>
        )}
        {almost.length > 0 && (
          <div className="upsell">
            <b>Mua thêm một chút để dùng mã lớn hơn</b>
            {almost.map(({ v, need, gain }) => (
              <p key={v.id}>Thêm <b>{vnd(need)}</b> để dùng “{v.title}” (lợi {vnd(gain.discount + gain.shipSaved + gain.cashback)})</p>
            ))}
          </div>
        )}
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          Tính theo quy tắc phổ biến: 1 mã giảm giá hoặc hoàn xu của sàn + 1 mã freeship. Mã của shop và điều kiện riêng (ngành hàng, phương thức thanh toán) có thể khác, hãy kiểm tra lại khi thanh toán.
        </p>
      </section>
    </div>
  );
}

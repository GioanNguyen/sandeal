import Form from "next/form";
import { Icon } from "./Icon";

/** Ô dán link sản phẩm (form GET, chạy được cả khi chưa tải JS) */
export function LinkCheckForm({ defaultValue, variant = "hero" }: { defaultValue?: string; variant?: "hero" | "page" }) {
  return (
    <Form action="/kiem-tra-gia" className={`linkcheck linkcheck-${variant}`} role="search">
      <label htmlFor={`lc-${variant}`} className="sr-only">Dán link sản phẩm Shopee, Lazada hoặc TikTok Shop</label>
      <Icon name="link" size={20} />
      <input
        id={`lc-${variant}`}
        name="url"
        type="text"
        inputMode="url"
        autoComplete="off"
        required
        defaultValue={defaultValue}
        placeholder="Dán link Shopee, Lazada, TikTok Shop…"
      />
      <button className="btn btn-primary" type="submit">Kiểm tra giá</button>
    </Form>
  );
}

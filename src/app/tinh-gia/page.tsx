import type { Metadata } from "next";
import { calcVouchers, getProduct } from "@/lib/queries";
import { PriceCalculator } from "@/components/PriceCalculator";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Máy tính giá cuối cùng – ghép mã giảm giá, freeship, hoàn xu tốt nhất",
  description: "Nhập giỏ hàng Shopee, Lazada, TikTok Shop, web tự chọn tổ hợp mã giảm giá, freeship, hoàn xu có lợi nhất và cho biết số tiền phải trả.",
  alternates: { canonical: "/tinh-gia" },
};

export default async function CalcPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const [vouchers, product] = await Promise.all([calcVouchers(), p ? getProduct(Number(p)) : Promise.resolve(null)]);
  return (
    <>
      <h1 className="page-title">Máy tính giá cuối cùng</h1>
      <p className="page-sub">Nhập giỏ hàng, chúng tôi chọn tổ hợp mã giảm giá, freeship, hoàn xu có lợi nhất cho bạn.</p>
      <PriceCalculator
        vouchers={vouchers}
        initial={product ? { platform: product.platform, item: { name: product.name, price: product.price, qty: 1 } } : undefined}
      />
    </>
  );
}

import type { Metadata } from "next";
import { ImageSearch } from "@/components/ImageSearch";
import { Icon } from "@/components/Icon";
import { indexedCount } from "@/lib/imagesearch";
import { imageSearchEnabled } from "@/lib/imagesearch/model";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Tìm bằng ảnh – thấy món trên TikTok, tìm ngay giá rẻ trên Shopee, Lazada",
  description: "Chụp màn hình hoặc tải ảnh sản phẩm lên để tìm món giống đang bán trên Shopee, Lazada, TikTok Shop kèm lịch sử giá và giảm giá thật.",
  alternates: { canonical: "/tim-bang-anh" },
};

export default async function ImageSearchPage() {
  const enabled = imageSearchEnabled();
  const indexed = enabled ? await indexedCount().catch(() => 0) : 0;
  return (
    <div className="imgsearch-page">
      <div className="imgsearch-head">
        <h1 className="page-title">Tìm bằng ảnh</h1>
        <p className="page-sub">
          Thấy món ưng trên TikTok, Facebook hay ngoài đời? Gửi ảnh để tìm món giống đang bán, kèm lịch sử giá và mức giảm thật.
        </p>
      </div>
      {!enabled ? (
        <div className="empty">Tính năng Tìm bằng ảnh đang tạm tắt.</div>
      ) : (
        <>
          {indexed === 0 && (
            <p className="verdict wait" role="status">
              <Icon name="clock" size={20} />
              <span>Săn Deal đang nhận diện ảnh các sản phẩm lần đầu, kết quả sẽ đầy đủ hơn sau ít phút.</span>
            </p>
          )}
          <ImageSearch indexed={indexed} />
          <ol className="steps">
            <li><b>Chụp màn hình</b> món đồ trên TikTok, Facebook, Instagram… hoặc chụp ảnh thật</li>
            <li><b>Chọn hoặc dán ảnh</b> vào đây, kéo trên ảnh để khoanh đúng món cần tìm</li>
            <li><b>So giá</b> các món giống trên 3 sàn, xem giảm thật hay ảo rồi mới mua</li>
          </ol>
          <p className="muted imgsearch-privacy">
            <Icon name="shield" size={14} /> Ảnh được thu nhỏ trên máy bạn, chỉ dùng để nhận diện rồi bỏ đi, Săn Deal không lưu ảnh.
            {indexed > 0 && <> Đang nhận diện được {indexed.toLocaleString("vi-VN")} sản phẩm.</>}
          </p>
        </>
      )}
    </div>
  );
}

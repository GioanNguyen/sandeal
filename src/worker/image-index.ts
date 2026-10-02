/**
 * Lập chỉ mục ảnh sản phẩm cho Tìm bằng ảnh.
 * - Trong web/worker: chạy định kỳ (scheduler) mỗi 20 phút, mỗi lần một đợt.
 * - Chạy tay toàn bộ: npm run images:index   (PGlite: tắt npm run dev trước)
 */
import { closeDb } from "@/lib/db";
import { indexProductImages } from "@/lib/imagesearch";
import { imageSearchEnabled } from "@/lib/imagesearch/model";

let running = false;
let warned = false;

/** Đang nhận diện ảnh sản phẩm (để việc nặng khác như dựng video Reels chờ chạy sau) */
export const imageIndexing = () => running;

/** Một đợt lập chỉ mục (không chạy chồng). Trả về số món vừa thêm. */
export async function runImageIndex(): Promise<number> {
  if (running || !imageSearchEnabled()) return 0;
  running = true;
  try {
    const n = await indexProductImages();
    if (n) console.log(`[image-search] đã nhận diện thêm ảnh của ${n} món`);
    warned = false;
    return n;
  } catch (err) {
    if (!warned) console.error("[image-search] lập chỉ mục ảnh lỗi:", (err as Error).message);
    warned = true;
    return 0;
  } finally {
    running = false;
  }
}

if (process.argv[1]?.endsWith("image-index.ts")) {
  (async () => {
    let total = 0;
    for (;;) {
      const n = await indexProductImages(200);
      total += n;
      console.log(`[image-search] +${n} (tổng ${total})`);
      if (!n) break;
    }
  })()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => closeDb().then(() => process.exit()));
}

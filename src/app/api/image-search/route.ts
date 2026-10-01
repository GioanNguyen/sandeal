import { NextResponse } from "next/server";
import { MAX_IMAGE_BYTES, searchByImage, sniffImage } from "@/lib/imagesearch";
import { ImageSearchUnavailable, imageSearchEnabled } from "@/lib/imagesearch/model";
import { allow, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

/** POST ảnh (form-data trường "image", hoặc thân request là ảnh) -> các món đang bán giống nhất */
export async function POST(req: Request) {
  if (!imageSearchEnabled()) return fail(503, "Tìm bằng ảnh đang tạm tắt.");
  if (!(await allow(`imgsearch:${clientIp(req)}`, 20, 600))) return fail(429, "Bạn tìm hơi nhiều, thử lại sau ít phút nhé.");

  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_IMAGE_BYTES + 64 * 1024) return fail(413, "Ảnh quá lớn (tối đa 6 MB).");

  let bytes: Uint8Array;
  try {
    if ((req.headers.get("content-type") || "").startsWith("multipart/form-data")) {
      const file = (await req.formData()).get("image");
      if (!(file instanceof Blob)) return fail(400, "Chưa có ảnh.");
      bytes = new Uint8Array(await file.arrayBuffer());
    } else {
      bytes = new Uint8Array(await req.arrayBuffer());
    }
  } catch {
    return fail(400, "Không đọc được ảnh gửi lên.");
  }
  if (!bytes.byteLength) return fail(400, "Chưa có ảnh.");
  if (bytes.byteLength > MAX_IMAGE_BYTES) return fail(413, "Ảnh quá lớn (tối đa 6 MB).");
  if (!sniffImage(bytes)) return fail(415, "Chỉ nhận ảnh JPG, PNG, WebP hoặc GIF.");

  try {
    const r = await searchByImage(bytes);
    return NextResponse.json(r, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    if (err instanceof ImageSearchUnavailable) return fail(503, "Bộ nhận diện ảnh đang khởi động, thử lại sau ít phút nhé.");
    console.error("[image-search] lỗi tìm:", err);
    return fail(500, "Không nhận diện được ảnh này, thử ảnh khác nhé.");
  }
}

/**
 * Mô hình nhận diện ảnh (CLIP) chạy ngay trên máy chủ bằng @huggingface/transformers – không gửi ảnh ra dịch vụ ngoài.
 * - Tải mô hình lần đầu khi cần (~90 MB, lưu ở IMAGE_MODEL_DIR, mặc định .data/models), sau đó dùng lại.
 * - Nạp lỗi (thiếu mạng khi tải mô hình…) thì web vẫn chạy, chỉ báo tính năng tạm chưa dùng được.
 *
 * .env:
 *   IMAGE_SEARCH=0            tắt hẳn
 *   IMAGE_MODEL               mặc định Xenova/clip-vit-base-patch32
 *   IMAGE_MODEL_DTYPE         q8 (nhẹ, mặc định) | fp32
 *   IMAGE_MODEL_DIR           thư mục lưu mô hình đã tải
 *   IMAGE_MODEL_LOCAL_DIR     đọc mô hình từ thư mục có sẵn, không tải mạng (máy không ra được Hugging Face)
 *   IMAGE_MODEL_HOST          máy chủ thay cho huggingface.co (mirror)
 */
import path from "node:path";
import { normalize } from "./vector";

export type Embedder = (image: Uint8Array) => Promise<Float32Array>;

const g = globalThis as unknown as { __sdEmbedder?: Promise<Embedder>; __sdEmbedTest?: Embedder | null };

export const MODEL_ID = () => process.env.IMAGE_MODEL || "Xenova/clip-vit-base-patch32";
/** Tên mô hình lưu cùng vector: đổi mô hình/độ chính xác thì vector cũ không dùng lẫn với vector mới */
export const modelKey = () => `${MODEL_ID()}@${process.env.IMAGE_MODEL_DTYPE || "q8"}`;

export function imageSearchEnabled() {
  return process.env.IMAGE_SEARCH !== "0";
}

/** Kiểm thử: thay mô hình thật bằng hàm giả (null = bỏ) */
export function setTestEmbedder(fn: Embedder | null) {
  g.__sdEmbedTest = fn;
}

async function load(): Promise<Embedder> {
  // Nạp khi cần (thư viện + onnxruntime khá nặng, không làm chậm lúc khởi động web)
  const tf = await import("@huggingface/transformers");
  const { env, AutoProcessor, CLIPVisionModelWithProjection, RawImage } = tf;
  env.cacheDir = path.resolve(process.env.IMAGE_MODEL_DIR || ".data/models");
  if (process.env.IMAGE_MODEL_HOST) env.remoteHost = process.env.IMAGE_MODEL_HOST.replace(/\/?$/, "/");
  if (process.env.IMAGE_MODEL_LOCAL_DIR) {
    env.localModelPath = path.resolve(process.env.IMAGE_MODEL_LOCAL_DIR);
    env.allowRemoteModels = false;
  }
  const id = MODEL_ID();
  const dtype = (process.env.IMAGE_MODEL_DTYPE || "q8") as "q8" | "fp32";
  const started = Date.now();
  const [processor, model] = await Promise.all([
    AutoProcessor.from_pretrained(id),
    CLIPVisionModelWithProjection.from_pretrained(id, { dtype, device: "cpu" }),
  ]);
  console.log(`[image-search] đã nạp mô hình ${id} (${dtype}) sau ${Date.now() - started} ms`);

  return async (bytes: Uint8Array) => {
    const img = await RawImage.fromBlob(new Blob([bytes as Uint8Array<ArrayBuffer>]));
    // Ảnh có nền trong suốt -> nền trắng như ảnh sản phẩm trên sàn
    const rgb = img.channels === 4 ? img.rgb() : img.channels === 1 ? img.rgb() : img;
    const inputs = await processor(rgb);
    const { image_embeds } = await model(inputs);
    return normalize(image_embeds.data as Float32Array);
  };
}

/** Giới hạn số ảnh xử lý cùng lúc để không chiếm hết CPU của web */
let active = 0;
const waiting: (() => void)[] = [];
const MAX_PARALLEL = Math.max(1, Number(process.env.IMAGE_SEARCH_PARALLEL) || 2);
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

export class ImageSearchUnavailable extends Error {}

/** Vector (đã chuẩn hoá) của một ảnh JPEG/PNG/WebP/GIF */
export async function embedImage(bytes: Uint8Array): Promise<Float32Array> {
  if (g.__sdEmbedTest) return g.__sdEmbedTest(bytes);
  if (!imageSearchEnabled()) throw new ImageSearchUnavailable("Tìm bằng ảnh đang tắt (IMAGE_SEARCH=0)");
  g.__sdEmbedder ??= load().catch((err) => {
    g.__sdEmbedder = undefined; // lần sau thử nạp lại (vd mạng chập chờn khi tải mô hình)
    console.error("[image-search] không nạp được mô hình:", (err as Error).message);
    throw new ImageSearchUnavailable("Chưa nạp được mô hình nhận diện ảnh");
  });
  const embed = await g.__sdEmbedder;
  return slot(() => embed(bytes));
}

/**
 * Phép tính vector cho Tìm bằng ảnh (thuần, không phụ thuộc DB/mô hình – dễ kiểm thử).
 * Vector ảnh đã chuẩn hoá (độ dài 1) nên độ giống = tích vô hướng (cosine), trong khoảng −1…1.
 */

export function normalize(v: ArrayLike<number>): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

/** Nén vector float về int8 (1 byte/số) kèm hệ số: giá trị gốc ≈ q × scale / 127. Sai số cosine < 0,005. */
export function quantize(v: Float32Array): { bytes: Uint8Array; scale: number } {
  let max = 0;
  for (let i = 0; i < v.length; i++) max = Math.max(max, Math.abs(v[i]));
  const scale = max || 1;
  const q = new Int8Array(v.length);
  for (let i = 0; i < v.length; i++) q[i] = Math.max(-127, Math.min(127, Math.round((v[i] / scale) * 127)));
  return { bytes: new Uint8Array(q.buffer), scale };
}

export function dequantize(bytes: Uint8Array, scale: number): Float32Array {
  const q = new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) out[i] = (q[i] * scale) / 127;
  return out;
}

/** Chỉ mục trong RAM: mọi vector nằm liền trong một mảng int8 để quét nhanh (50.000 món ≈ 25 MB, ~30 ms/lần tìm). */
export class VectorIndex {
  readonly ids: Int32Array;
  readonly dim: number;
  private data: Int8Array;
  private scales: Float32Array;

  constructor(rows: { id: number; bytes: Uint8Array; scale: number }[], dim: number) {
    const ok = rows.filter((r) => r.bytes.byteLength === dim);
    this.dim = dim;
    this.ids = new Int32Array(ok.length);
    this.data = new Int8Array(ok.length * dim);
    this.scales = new Float32Array(ok.length);
    ok.forEach((r, i) => {
      this.ids[i] = r.id;
      this.data.set(new Int8Array(r.bytes.buffer, r.bytes.byteOffset, dim), i * dim);
      this.scales[i] = r.scale / 127;
    });
  }

  get size() {
    return this.ids.length;
  }

  /** Top-k món giống nhất với vector truy vấn (đã chuẩn hoá), chỉ lấy độ giống ≥ minScore */
  search(query: Float32Array, k: number, minScore = -1): { id: number; score: number }[] {
    if (query.length !== this.dim) throw new Error(`Vector truy vấn ${query.length} chiều, chỉ mục ${this.dim} chiều`);
    const best: { id: number; score: number }[] = [];
    const d = this.dim;
    for (let i = 0; i < this.ids.length; i++) {
      let s = 0;
      const off = i * d;
      for (let j = 0; j < d; j++) s += this.data[off + j] * query[j];
      s *= this.scales[i];
      if (s < minScore) continue;
      if (best.length < k) {
        best.push({ id: this.ids[i], score: s });
        if (best.length === k) best.sort((a, b) => b.score - a.score);
      } else if (s > best[k - 1].score) {
        // chèn giữ thứ tự giảm dần
        let p = k - 1;
        while (p > 0 && best[p - 1].score < s) {
          best[p] = best[p - 1];
          p--;
        }
        best[p] = { id: this.ids[i], score: s };
      }
    }
    return best.sort((a, b) => b.score - a.score);
  }
}

/** Mức giống để hiện nhãn (ngưỡng chỉnh được qua .env vì mỗi mô hình có thang điểm hơi khác) */
export function similarityLabel(score: number, t = thresholds()): "same" | "very" | "similar" {
  if (score >= t.same) return "same";
  if (score >= t.very) return "very";
  return "similar";
}

export function thresholds() {
  const num = (k: string, d: number) => {
    const v = Number(process.env[k]);
    return Number.isFinite(v) && v > 0 ? v : d;
  };
  return { same: num("IMAGE_SIM_SAME", 0.93), very: num("IMAGE_SIM_VERY", 0.85), min: num("IMAGE_SIM_MIN", 0.72) };
}

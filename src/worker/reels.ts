/**
 * Reels tự động cho Trang Facebook: video dọc 1080×1920, ~12 giây, 3 cảnh dựng từ số liệu thật của Săn Deal
 *   1. Câu mở đầu + ảnh sản phẩm   2. Biểu đồ giá "vẽ dần"   3. Kết luận + giá + "Link mua ở bình luận"
 * Khung hình do chính web vẽ (/reel/frame), ffmpeg ghép thành video ở mức ưu tiên thấp (nice 19, 1 luồng),
 * mỗi lần 1 video. Dựng sẵn vào giờ vắng (REELS_PREPARE_HOUR) rồi đăng vào giờ vàng (REELS_HOURS).
 *
 * .env: REELS=0 để tắt · REELS_HOURS="12,21" · REELS_PREPARE_HOUR=5 · REELS_DIR=.data/reels
 *       REELS_MUSIC_DIR=thư mục nhạc miễn phí bản quyền (.mp3/.m4a, chọn ngẫu nhiên). Mặc định src/assets/music
 *       (nhạc để trong code, đi theo git và gói triển khai); thư mục không có nhạc = video không nhạc
 *       REELS_MUSIC_LUFS=độ to nhạc nền (LUFS, mặc định -16): mỗi bài được đo rồi chỉnh về cùng mức này
 *       REELS_RENDER_URL=địa chỉ web để lấy khung hình (mặc định http://127.0.0.1:PORT; Docker: http://web:3000)
 *       FFMPEG_PATH=đường dẫn ffmpeg (mặc định "ffmpeg" trong PATH)
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { products, socialPosts, type Product } from "@/db/schema";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/mail";
import { REEL_PLOT, type ReelFrameData } from "@/lib/og";
import { priceK } from "@/lib/social";
import { getProduct } from "@/lib/queries";
import { gioiThieu, singleDrafts, type PostDraft } from "@/lib/fbposts";
import { draftContext, pickDeals } from "./social";

export const REEL_CHANNEL = "facebook_reel";
const GRAPH = () => `https://graph.facebook.com/${process.env.FB_GRAPH_VERSION || "v21.0"}`;
const DAY = 86_400_000;

export const reelsEnabled = () => process.env.REELS !== "0" && !!process.env.FB_PAGE_ID && !!process.env.FB_PAGE_TOKEN;
const reelsDir = () => path.resolve(process.env.REELS_DIR || ".data/reels");

/** Thời lượng từng cảnh (giây) và thời gian chuyển cảnh (mờ dần qua nền sáng) */
export const SCENES = { d1: 3.5, d2: 5.5, d3: 4.5, x: 0.25 } as const;
export const reelDuration = () => SCENES.d1 + SCENES.d2 + SCENES.d3;

const HOOK: Record<string, (d: PostDraft, x: { claim: number; days: number; dropBy: number }) => { hook: string; sub?: string }> = {
  "that-hay-ao": (_d, x) => ({ hook: `Shop ghi giảm ${x.claim}%`, sub: "Giảm thật được bao nhiêu?" }),
  "ky-luc": (_d, x) => ({ hook: "Giá thấp nhất từ trước tới nay", sub: `Săn Deal theo dõi ${x.days} ngày` }),
  "vua-giam": (_d, x) => ({ hook: `Vừa giảm ${priceK(x.dropBy)}`, sub: "Giá vừa đổi hôm nay" }),
  "mua-hay-cho": () => ({ hook: "Mua ngay hay chờ sale?", sub: "Xem lịch sử giá rồi quyết" }),
  "sau-ma": () => ({ hook: "Còn rẻ hơn nữa khi áp mã", sub: "Giá sau mã ở cuối video" }),
  "so-san": () => ({ hook: "Cùng một món, sàn nào rẻ hơn?" }),
  "don-vi": () => ({ hook: "Tính theo đơn vị mới biết rẻ", sub: "Mua cái nào lợi hơn?" }),
  "gioi-thieu": () => ({ hook: "Deal đáng chú ý hôm nay", sub: "Giá có đang rẻ thật?" }),
};

export interface ReelPlan {
  productId: number;
  kind: string;
  frame: ReelFrameData;
  /** Mô tả của Reel (không link: bài có link ngoài bị giảm tiếp cận) */
  caption: string;
  /** Bình luận đầu: link mua, lịch sử giá, mã giảm */
  comment: string;
}

/** Nội dung video cho 1 món, toàn bộ từ dữ liệu thật (cùng nguồn với các mẫu bài Facebook) */
export async function reelPlan(p: Product, now = new Date()): Promise<ReelPlan> {
  const ctx = await draftContext(p, now);
  // Mẫu "Đoán giá" giấu giá – không hợp với video có giá ở cảnh cuối
  const drafts = singleDrafts(ctx).filter((d) => d.kind !== "doan-gia");
  const d = drafts[0] ?? gioiThieu(ctx);
  const a = ctx.advice;
  const full = await getProduct(p.id);
  const hist = (full?.prices ?? []).map((x) => [x.capturedAt.getTime(), x.price] as [number, number]);
  const days = Math.max(1, Math.min(90, Math.floor(a.trackedDays)));
  const claim = p.originalPrice && p.originalPrice > p.price ? Math.round((1 - p.price / p.originalPrice) * 100) : Math.round(p.discountPct);
  const h = (HOOK[d.kind] ?? HOOK["gioi-thieu"])(d, { claim, days: Math.floor(a.trackedDays), dropBy: ctx.droppedBy ?? 0 });
  const tone: ReelFrameData["verdict"]["tone"] = a.verdict === "buy" ? "good" : a.verdict === "new" ? "new" : "wait";
  const v = ctx.withVoucher && ctx.withVoucher.price < p.price - 1000 ? ctx.withVoucher.price : null;
  const host = siteUrl().replace(/^https?:\/\//, "");
  return {
    productId: p.id,
    kind: d.kind,
    frame: {
      hook: h.hook,
      sub: h.sub,
      name: p.name.replace(/\s+/g, " ").trim(),
      platform: p.platform,
      imageUrl: p.imageUrl,
      price: p.price,
      originalPrice: p.originalPrice,
      realDropPct: a.trackedDays >= 7 ? p.realDropPct : 0,
      chart: { points: [...hist, [now.getTime(), p.price]], low: Math.min(a.low, p.price), usual: a.usual, high: a.high, days },
      verdict: { tone, title: a.verdict === "new" ? "Mới bắt đầu theo dõi" : a.title },
      // Bỏ lý do trùng với nhãn "Rẻ hơn giá thường ngày" đã hiện ở cảnh cuối
      reasons: a.reasons.filter((r) => r.length <= 110 && !(a.trackedDays >= 7 && p.realDropPct >= 5 && /^Rẻ hơn giá thường ngày/.test(r))),
      afterCode: v,
      link: `${host}/p/${p.id}`,
    },
    caption: d.body,
    comment: d.comment,
  };
}

// ---------- Dựng video ----------

let ffmpegOk: { ok: boolean; at: number } | null = null;
const ffmpegBin = () => process.env.FFMPEG_PATH || "ffmpeg";

/**
 * Có ffmpeg không. "Có" thì nhớ luôn; "không có" chỉ nhớ 1 phút để cài ffmpeg xong là dùng được ngay,
 * không cần khởi động lại dịch vụ.
 */
export async function hasFfmpeg(): Promise<boolean> {
  if (ffmpegOk && (ffmpegOk.ok || Date.now() - ffmpegOk.at < 60_000)) return ffmpegOk.ok;
  const ok = await new Promise<boolean>((done) => {
    const c = spawn(ffmpegBin(), ["-version"], { stdio: "ignore" });
    c.on("error", () => done(false));
    c.on("exit", (code) => done(code === 0));
  });
  ffmpegOk = { ok, at: Date.now() };
  return ok;
}

/** Chạy ffmpeg ở mức ưu tiên thấp nhất (nice 19 trên Linux/macOS) để không giành CPU của web */
function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const useNice = process.platform !== "win32" && process.env.REELS_NICE !== "0";
    const c = useNice ? spawn("nice", ["-n", "19", ffmpegBin(), ...args], { stdio: ["ignore", "ignore", "pipe"] }) : spawn(ffmpegBin(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    c.stderr.on("data", (b) => (err = (err + b.toString()).slice(-2000)));
    c.on("error", reject);
    c.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg lỗi (${code}): ${err.split("\n").filter(Boolean).slice(-3).join(" | ")}`))));
  });
}

/** Độ to mục tiêu của nhạc nền (LUFS, chuẩn đo độ to theo tai nghe) */
export const musicTarget = () => {
  const v = Number(process.env.REELS_MUSIC_LUFS);
  return Number.isFinite(v) && v < 0 && v > -40 ? v : -16;
};

/** Mức chỉnh (dB) để đưa bài có độ to `lufs` về mức mục tiêu; giới hạn ±15 dB để bài lỗi/im lặng không bị đẩy quá tay */
export const gainFor = (lufs: number, target = musicTarget()) => Math.max(-15, Math.min(15, Math.round((target - lufs) * 10) / 10));

/** Bộ lọc âm lượng nhạc: có số đo thì chỉnh về cùng độ to + chặn đỉnh (không vỡ tiếng); chưa đo được thì giảm cố định như cũ */
function musicLevel(o: { music: string | null; musicGainDb?: number | null }) {
  if (!o.music) return "";
  if (o.musicGainDb == null || !Number.isFinite(o.musicGainDb)) return "volume=0.55,";
  return `volume=${o.musicGainDb}dB,alimiter=limit=0.89:level=disabled,`;
}

/** Đo độ to (LUFS) của đoạn nhạc sẽ dùng (đúng số giây của video), nhớ kết quả theo file + thời điểm sửa */
const loudCache = new Map<string, number | null>();
export async function measureLoudness(file: string, seconds = reelDuration()): Promise<number | null> {
  let key = file;
  try {
    const st = await fs.stat(file);
    key = `${file}:${st.size}:${st.mtimeMs}`;
  } catch {
    return null;
  }
  if (loudCache.has(key)) return loudCache.get(key)!;
  const lufs = await new Promise<number | null>((ok) => {
    const useNice = process.platform !== "win32" && process.env.REELS_NICE !== "0";
    const args = ["-hide_banner", "-nostats", "-stream_loop", "-1", "-t", seconds.toFixed(2), "-i", file, "-vn", "-af", "ebur128", "-f", "null", "-"];
    const c = useNice ? spawn("nice", ["-n", "19", ffmpegBin(), ...args], { stdio: ["ignore", "ignore", "pipe"] }) : spawn(ffmpegBin(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    c.stderr.on("data", (b) => (err = (err + b.toString()).slice(-3000)));
    c.on("error", () => ok(null));
    c.on("exit", (code) => {
      // Phần tổng kết cuối: "Integrated loudness:\n    I:  -14.2 LUFS"
      const m = /Integrated loudness:\s*I:\s*(-?[\d.]+) LUFS/.exec(err);
      const v = m ? Number(m[1]) : NaN;
      ok(code === 0 && Number.isFinite(v) && v > -70 ? v : null);
    });
  });
  loudCache.set(key, lufs);
  return lufs;
}

/** Lệnh ffmpeg ghép 3 cảnh (tách riêng để kiểm thử) */
export function ffmpegArgs(o: { frames: [string, string, string]; music: string | null; out: string; musicGainDb?: number | null }) {
  const { d1, d2, d3, x } = SCENES;
  const T = reelDuration();
  const P = REEL_PLOT;
  const r = "30";
  // REELS_HEIGHT=1280 cho VPS yếu: video 720×1280 (Facebook nhận từ 540×960), nhẹ hơn khoảng một nửa
  const H = Number(process.env.REELS_HEIGHT) === 1280 ? 1280 : 1920;
  const W = H === 1280 ? 720 : 1080;
  const args = [
    "-y", "-hide_banner", "-loglevel", "error",
    "-loop", "1", "-framerate", r, "-t", String(d1), "-i", o.frames[0],
    "-loop", "1", "-framerate", r, "-t", String(d2), "-i", o.frames[1],
    "-f", "lavfi", "-t", String(d2), "-i", `color=c=white:s=${P.w + 8}x${P.h + 8}:r=${r}`,
    "-loop", "1", "-framerate", r, "-t", String(d3), "-i", o.frames[2],
  ];
  if (o.music) args.push("-stream_loop", "-1", "-i", o.music);
  else args.push("-f", "lavfi", "-t", String(T), "-i", "anullsrc=r=48000:cl=stereo");
  // Nối 3 cảnh tuần tự (concat) thay vì chồng hình (xfade): ffmpeg không phải giữ hàng trăm khung hình chờ trong RAM
  const fades = (d: number, first: boolean, last: boolean) =>
    [first ? "fade=t=in:st=0:d=0.3" : `fade=t=in:st=0:d=${x}:color=white`, `fade=t=out:st=${(d - (last ? 0.3 : x)).toFixed(2)}:d=${last ? 0.3 : x}${last ? "" : ":color=white"}`].join(",");
  const filter = [
    `[0:v]scale=${W}:${H},setsar=1,format=yuv420p,${fades(d1, true, false)}[s1]`,
    // Biểu đồ "vẽ dần": cắt riêng vùng biểu đồ, phủ tấm trắng rồi kéo tấm trắng sang phải trong 2,6 giây,
    // ghép lại vào khung (tấm trắng chỉ nằm trong vùng biểu đồ nên không lộ ra ngoài thẻ)
    `[1:v]split[bg][pc]`,
    `[pc]crop=${P.w + 8}:${P.h + 8}:${P.x - 4}:${P.y - 4}[plot]`,
    `[plot][2:v]overlay=x='${P.w + 8}*min(1\\,max(0\\,(t-0.5)/2.6))':y=0:eval=frame[plotrev]`,
    `[bg][plotrev]overlay=x=${P.x - 4}:y=${P.y - 4},scale=${W}:${H},setsar=1,format=yuv420p,${fades(d2, false, false)}[s2]`,
    `[3:v]scale=${W}:${H},setsar=1,format=yuv420p,${fades(d3, false, true)}[s3]`,
    `[s1][s2][s3]concat=n=3:v=1:a=0[v]`,
    `[4:a]atrim=0:${T.toFixed(2)},asetpts=PTS-STARTPTS,aresample=48000,${musicLevel(o)}afade=t=in:d=0.4,afade=t=out:st=${(T - 1).toFixed(2)}:d=1[aout]`,
  ].join(";");
  args.push(
    "-filter_threads", "1",
    "-filter_complex_threads", "1",
    "-filter_complex", filter,
    "-map", "[v]", "-map", "[aout]",
    "-t", T.toFixed(2),
    // Ít khung nhìn trước (lookahead), không B-frame: RAM ~half so với mặc định, Facebook nén lại video dù sao
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", r,
    "-x264-params", "rc-lookahead=5:sync-lookahead=0:ref=1:bframes=0",
    "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
    "-threads", "1", "-movflags", "+faststart",
    o.out,
  );
  return args;
}

/** Thư mục nhạc nền: REELS_MUSIC_DIR, mặc định src/assets/music trong code */
export const musicDir = () => path.resolve(process.env.REELS_MUSIC_DIR || "src/assets/music");

async function pickMusic(): Promise<string | null> {
  const dir = musicDir();
  try {
    const files = (await fs.readdir(dir)).filter((f) => /\.(mp3|m4a|aac|wav|ogg)$/i.test(f));
    return files.length ? path.join(dir, files[Math.floor(Math.random() * files.length)]) : null;
  } catch {
    return null;
  }
}

const renderBase = () => (process.env.REELS_RENDER_URL || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(/\/$/, "");

/** Tải 3 khung hình từ chính web (route /reel/frame), có kèm mật khẩu nếu site đang khoá */
async function fetchFrames(productId: number, dir: string): Promise<[string, string, string]> {
  const headers: Record<string, string> = {};
  if (process.env.BASIC_AUTH_USER && process.env.BASIC_AUTH_PASSWORD) {
    headers.authorization = `Basic ${Buffer.from(`${process.env.BASIC_AUTH_USER}:${process.env.BASIC_AUTH_PASSWORD}`).toString("base64")}`;
  }
  const out: string[] = [];
  for (const s of [1, 2, 3]) {
    const res = await fetch(`${renderBase()}/reel/frame?id=${productId}&s=${s}`, { headers, signal: AbortSignal.timeout(30_000) });
    if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) throw new Error(`Không lấy được khung hình ${s} (HTTP ${res.status})`);
    const f = path.join(dir, `s${s}.png`);
    await fs.writeFile(f, Buffer.from(await res.arrayBuffer()));
    out.push(f);
  }
  return out as [string, string, string];
}

let rendering: Promise<unknown> = Promise.resolve();
/** Mỗi lần chỉ dựng 1 video (các yêu cầu sau xếp hàng chờ) */
function oneAtATime<T>(fn: () => Promise<T>): Promise<T> {
  const next = rendering.then(fn, fn);
  rendering = next.catch(() => {});
  return next;
}

/** Dựng video cho 1 món, trả về đường dẫn file .mp4 */
export function renderReel(productId: number, outFile?: string): Promise<string> {
  return oneAtATime(async () => {
    if (!(await hasFfmpeg())) throw new Error("Chưa cài ffmpeg trên máy chủ – xem hướng dẫn cài ở deploy/DEPLOY.md (mục ffmpeg)");
    const dir = reelsDir();
    await fs.mkdir(dir, { recursive: true });
    const tmp = await fs.mkdtemp(path.join(dir, "tmp-"));
    try {
      const frames = await fetchFrames(productId, tmp);
      const out = outFile ?? path.join(dir, `reel-${productId}-${Date.now()}.mp4`);
      const music = await pickMusic();
      const lufs = music ? await measureLoudness(music) : null;
      await runFfmpeg(ffmpegArgs({ frames, music, out, musicGainDb: lufs == null ? null : gainFor(lufs) }));
      return out;
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
}

// ---------- Đăng lên Trang Facebook (Reels Publishing API) ----------

async function graphPost(url: string, body: Record<string, unknown>) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, access_token: process.env.FB_PAGE_TOKEN }) });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message: string } };
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  return json;
}

/** 3 bước: mở phiên tải lên → tải file → đăng. Sau đó đăng bình luận đầu chứa link. Trả về id video. */
export async function publishReel(file: string, caption: string, comment?: string): Promise<string> {
  const page = process.env.FB_PAGE_ID!;
  const start = await graphPost(`${GRAPH()}/${page}/video_reels`, { upload_phase: "start" });
  const videoId = String(start.video_id ?? "");
  if (!videoId) throw new Error("Facebook không trả video_id");
  const data = await fs.readFile(file);
  const up = await fetch(`https://rupload.facebook.com/video-upload/${process.env.FB_GRAPH_VERSION || "v21.0"}/${videoId}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${process.env.FB_PAGE_TOKEN}`, offset: "0", file_size: String(data.length), "Content-Type": "application/octet-stream" },
    body: data,
  });
  const upJson = (await up.json().catch(() => ({}))) as { success?: boolean; debug_info?: { message?: string } };
  if (!up.ok || !upJson.success) throw new Error(`Tải video lên lỗi: ${upJson.debug_info?.message ?? `HTTP ${up.status}`}`);
  await graphPost(`${GRAPH()}/${page}/video_reels`, { upload_phase: "finish", video_id: videoId, video_state: "PUBLISHED", description: caption.slice(0, 2000) });
  if (comment) {
    // Facebook cần vài giây xử lý video trước khi nhận bình luận: thử lại vài lần, lỗi thì bỏ qua (Reel đã đăng)
    for (let i = 0; i < 4; i++) {
      try {
        const base = Number(process.env.REELS_COMMENT_WAIT_MS ?? 5000);
        await new Promise((r) => setTimeout(r, i === 0 ? base : base * 3));
        await graphPost(`${GRAPH()}/${videoId}/comments`, { message: comment });
        break;
      } catch (err) {
        if (i === 3) console.warn("[reels] bình luận đầu lỗi:", (err as Error).message);
      }
    }
  }
  return videoId;
}

// ---------- Lịch: dựng sẵn giờ vắng, đăng giờ vàng ----------

interface Prepared { productId: number; file: string; price: number; caption: string; comment: string; at: number }
const queueFile = () => path.join(reelsDir(), "queue.json");

async function readQueue(): Promise<Prepared[]> {
  try {
    return JSON.parse(await fs.readFile(queueFile(), "utf8")) as Prepared[];
  } catch {
    return [];
  }
}
const writeQueue = (q: Prepared[]) => fs.writeFile(queueFile(), JSON.stringify(q, null, 2));
export const reelHours = () => (process.env.REELS_HOURS || "12,21").split(",").map((h) => Number(h.trim())).filter((h) => h >= 0 && h <= 23);

/** Dựng sẵn video cho các khung giờ đăng trong ngày (chạy lúc vắng khách, mặc định 5 giờ sáng) */
export async function prepareReels(now = new Date()): Promise<number> {
  if (!reelsEnabled() || !(await hasFfmpeg())) return 0;
  await fs.mkdir(reelsDir(), { recursive: true });
  const old = await readQueue();
  // Bỏ video cũ hơn 1 ngày
  const keep = old.filter((x) => now.getTime() - x.at < DAY);
  for (const x of old.filter((y) => !keep.includes(y))) await fs.rm(x.file, { force: true });
  const need = reelHours().length - keep.length;
  if (need <= 0) return 0;
  const deals = (await pickDeals(REEL_CHANNEL, need + keep.length, now)).filter((d) => !keep.some((k) => k.productId === d.id)).slice(0, need);
  let n = 0;
  for (const p of deals) {
    try {
      const plan = await reelPlan(p, now);
      const file = await renderReel(p.id);
      keep.push({ productId: p.id, file, price: p.price, caption: plan.caption, comment: plan.comment, at: now.getTime() });
      n++;
    } catch (err) {
      console.error(`[reels] dựng video món ${p.id} lỗi:`, (err as Error).message);
    }
  }
  await writeQueue(keep);
  return n;
}

/** Đăng 1 Reel: dùng video đã dựng sẵn nếu giá chưa đổi, không thì dựng ngay */
export async function postReel(now = new Date(), productId?: number): Promise<{ ok: boolean; productId?: number; videoId?: string; error?: string }> {
  if (!reelsEnabled()) return { ok: false, error: "Chưa bật Reels (cần FB_PAGE_ID, FB_PAGE_TOKEN và REELS khác 0)" };
  let q = await readQueue();
  let item: Prepared | undefined;
  let p: Product | undefined;
  if (productId) {
    [p] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!p) return { ok: false, error: "Không tìm thấy sản phẩm" };
  } else {
    // Video dựng sẵn còn đúng giá hiện tại
    for (const x of q) {
      const [cur] = await db.select().from(products).where(eq(products.id, x.productId)).limit(1);
      if (cur && cur.price === x.price) {
        item = x;
        p = cur;
        break;
      }
    }
    if (!p) [p] = await pickDeals(REEL_CHANNEL, 1, now);
    if (!p) return { ok: false, error: "Không có deal phù hợp để đăng" };
  }
  let file = item?.file;
  let caption = item?.caption;
  let comment = item?.comment;
  let videoId: string | undefined;
  let error: string | undefined;
  try {
    if (!file) {
      const plan = await reelPlan(p, now);
      caption = plan.caption;
      comment = plan.comment;
      file = await renderReel(p.id);
    }
    videoId = await publishReel(file, caption!, comment);
  } catch (err) {
    error = (err as Error).message.slice(0, 300);
    console.error("[reels] đăng lỗi:", error);
  }
  await db.insert(socialPosts).values({ channel: REEL_CHANNEL, productId: p.id, externalId: videoId ?? null, error: error ?? null });
  // Dọn: bỏ khỏi hàng chờ và xoá file
  q = q.filter((x) => x.productId !== p!.id);
  await writeQueue(q).catch(() => {});
  if (file) await fs.rm(file, { force: true });
  return error ? { ok: false, productId: p.id, error } : { ok: true, productId: p.id, videoId };
}

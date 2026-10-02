/** Reels: nội dung video từ số liệu thật, lệnh ffmpeg dựng được video đúng chuẩn Reels, đăng 3 bước + bình luận đầu */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_URL = "memory://";
process.env.SITE_URL = "https://sandealgiare.com";
process.env.SOURCES = "mock";
process.env.REELS_COMMENT_WAIT_MS = "1";

let reels: typeof import("@/worker/reels");
let ingest: typeof import("./ingest");
let dbm: typeof import("./db");

before(async () => {
  dbm = await import("./db");
  await dbm.ensureMigrated();
  reels = await import("@/worker/reels");
  ingest = await import("./ingest");
});

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

test("nội dung video lấy từ lịch sử giá thật, không có mẫu Đoán giá (giấu giá)", async () => {
  const DAY = 86_400_000;
  const now = new Date();
  const base = { platform: "shopee" as const, externalId: "880001", name: "Tai nghe chống ồn ABC", discountPct: 40, originalPrice: 1_000_000, affiliateUrl: "https://s.shopee.vn/x", imageUrl: "https://down-vn.img.susercontent.com/file/x" };
  for (const [d, price] of [[40, 900_000], [30, 880_000], [20, 900_000], [10, 870_000], [1, 600_000]] as const) {
    await ingest.upsertProduct({ ...base, price }, new Date(now.getTime() - d * DAY));
  }
  const { products } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const [p] = await dbm.db.select().from(products).where(eq(products.externalId, "880001"));
  const plan = await reels.reelPlan(p, now);
  assert.notEqual(plan.kind, "doan-gia");
  assert.equal(plan.frame.price, 600_000);
  assert.ok(plan.frame.chart.points.length >= 5, "đủ điểm lịch sử giá");
  assert.equal(plan.frame.chart.low, 600_000);
  assert.ok(plan.frame.chart.usual >= 870_000);
  assert.equal(plan.frame.link, `sandealgiare.com/p/${p.id}`);
  assert.doesNotMatch(plan.caption, /https?:\/\//, "mô tả Reel không có link");
  assert.match(plan.comment, new RegExp(`/p/${p.id}`), "link ở bình luận đầu");
  assert.ok(plan.frame.hook.length > 5);
});

test("lệnh ffmpeg: 3 cảnh, nối tuần tự, ưu tiên ít RAM, đủ âm thanh", () => {
  const a = reels.ffmpegArgs({ frames: ["a.png", "b.png", "c.png"], music: null, out: "o.mp4" });
  const f = a[a.indexOf("-filter_complex") + 1];
  assert.match(f, /concat=n=3:v=1:a=0/);
  assert.doesNotMatch(f, /xfade/, "không dùng xfade (giữ nhiều khung hình trong RAM)");
  assert.ok(a.includes("anullsrc=r=48000:cl=stereo"), "không nhạc thì có âm thanh im lặng (Facebook cần AAC 48kHz)");
  assert.equal(a[a.indexOf("-threads") + 1], "1");
  assert.match(a[a.indexOf("-x264-params") + 1], /rc-lookahead=5/);
  const m = reels.ffmpegArgs({ frames: ["a.png", "b.png", "c.png"], music: "/x/nhac.mp3", out: "o.mp4" });
  assert.ok(m.includes("-stream_loop") && m.includes("/x/nhac.mp3"));
  assert.match(m[m.indexOf("-filter_complex") + 1], /volume=0\.55/, "chưa đo được độ to: giảm cố định");
  const g = reels.ffmpegArgs({ frames: ["a.png", "b.png", "c.png"], music: "/x/nhac.mp3", out: "o.mp4", musicGainDb: -5.2 });
  assert.match(g[g.indexOf("-filter_complex") + 1], /volume=-5\.2dB,alimiter=limit=0\.89:level=disabled/, "đã đo: chỉnh về mức chung + chặn đỉnh");
  assert.equal(reels.gainFor(-10.3, -16), -5.7);
  assert.equal(reels.gainFor(-60, -16), 15, "bài gần như im lặng: không đẩy quá 15 dB");
  assert.equal(reels.reelDuration(), 13.5);
});

test("cân âm lượng: hai bài to nhỏ khác nhau ra cùng độ to", { skip: !hasFfmpeg && "máy không có ffmpeg" }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "loud-"));
  try {
    const frames = [1, 2, 3].map((i) => {
      const f = path.join(dir, `s${i}.png`);
      execFileSync("ffmpeg", ["-loglevel", "error", "-f", "lavfi", "-i", "color=c=white:s=1080x1920", "-frames:v", "1", f]);
      return f;
    }) as [string, string, string];
    const out: number[] = [];
    for (const [i, vol] of [3, 0.6].entries()) {
      const music = path.join(dir, `m${i}.mp3`);
      execFileSync("ffmpeg", ["-loglevel", "error", "-f", "lavfi", "-i", `sine=frequency=440:sample_rate=48000:duration=5,volume=${vol}`, "-ac", "2", music]);
      const lufs = await reels.measureLoudness(music);
      assert.ok(lufs != null);
      const o = path.join(dir, `o${i}.mp4`);
      execFileSync("ffmpeg", reels.ffmpegArgs({ frames, music, out: o, musicGainDb: reels.gainFor(lufs!) }));
      const log = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", o, "-vn", "-af", "ebur128", "-f", "null", "-"]).stderr.toString();
      out.push(Number(/Integrated loudness:\s*I:\s*(-?[\d.]+)/.exec(log)?.[1]));
    }
    assert.ok(Math.abs(out[0] - out[1]) < 1, `độ to 2 video: ${out.join(" / ")}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("dựng video thật: 1080×1920, H.264 + AAC 48kHz stereo, ~13,5 giây", { skip: !hasFfmpeg && "máy không có ffmpeg" }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reel-"));
  try {
    const frames = [1, 2, 3].map((i) => {
      const f = path.join(dir, `s${i}.png`);
      execFileSync("ffmpeg", ["-loglevel", "error", "-f", "lavfi", "-i", `color=c=0x${["e8491d", "fff7f2", "ffa41b"][i - 1]}:s=1080x1920`, "-frames:v", "1", f]);
      return f;
    }) as [string, string, string];
    const out = path.join(dir, "o.mp4");
    execFileSync("ffmpeg", reels.ffmpegArgs({ frames, music: null, out }));
    const info = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_name,width,height,sample_rate,channels", "-of", "json", out]).toString();
    const j = JSON.parse(info) as { format: { duration: string }; streams: { codec_name: string; width?: number; height?: number; sample_rate?: string; channels?: number }[] };
    const v = j.streams.find((s) => s.codec_name === "h264")!;
    const au = j.streams.find((s) => s.codec_name === "aac")!;
    assert.deepEqual([v.width, v.height], [1080, 1920]);
    assert.deepEqual([au.sample_rate, au.channels], ["48000", 2]);
    assert.ok(Math.abs(Number(j.format.duration) - 13.5) < 0.2, j.format.duration);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("đăng Reel: mở phiên → tải file → đăng, rồi bình luận đầu chứa link", async () => {
  process.env.FB_PAGE_ID = "PAGE1";
  process.env.FB_PAGE_TOKEN = "TOKEN1";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reelpub-"));
  const file = path.join(dir, "v.mp4");
  fs.writeFileSync(file, Buffer.alloc(1234, 1));
  const calls: { url: string; body?: Record<string, unknown>; headers?: Record<string, string> }[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: { body?: unknown; headers?: Record<string, string> }) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url: String(url), body, headers: init?.headers });
    if (String(url).includes("rupload.facebook.com")) return new Response(JSON.stringify({ success: true }));
    if (body?.upload_phase === "start") return new Response(JSON.stringify({ video_id: "VID9", upload_url: "x" }));
    if (body?.upload_phase === "finish") return new Response(JSON.stringify({ success: true }));
    return new Response(JSON.stringify({ id: "C1" }));
  }) as typeof fetch;
  try {
    const id = await reels.publishReel(file, "Mô tả #SănDeal", "📊 https://sandealgiare.com/p/1");
    assert.equal(id, "VID9");
    assert.match(calls[0].url, /\/PAGE1\/video_reels$/);
    assert.equal(calls[0].body?.upload_phase, "start");
    assert.match(calls[1].url, /rupload\.facebook\.com\/video-upload\/v\d+\.\d+\/VID9$/);
    assert.equal(calls[1].headers?.file_size, "1234");
    assert.equal(calls[1].headers?.Authorization, "OAuth TOKEN1");
    assert.deepEqual([calls[2].body?.upload_phase, calls[2].body?.video_state, calls[2].body?.description], ["finish", "PUBLISHED", "Mô tả #SănDeal"]);
    assert.match(calls[3].url, /\/VID9\/comments$/);
    assert.match(String(calls[3].body?.message), /\/p\/1/);
  } finally {
    globalThis.fetch = orig;
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.FB_PAGE_ID;
    delete process.env.FB_PAGE_TOKEN;
  }
});

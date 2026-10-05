/**
 * Việc định kỳ: xếp danh mục cho món chưa có danh mục (mặc định mỗi giờ, phút 25).
 * 1) Đoán theo từ khoá trong tên (miễn phí, đa số món).
 * 2) Món không đoán chắc được: hỏi AI (Claude Haiku, có ANTHROPIC_API_KEY) theo lô 50 món, chỉ được chọn trong danh sách danh mục.
 *    Không có AI thì dùng luôn kết quả từ khoá dù chưa thật chắc (vẫn hơn để trống); không khớp từ nào thì để trống.
 * Gộp tên danh mục tiếng Anh của sàn ("Women Clothes"…) về tên tiếng Việt.
 *
 * .env: AUTOCAT=0 để tắt · AUTOCAT_AI=0 để không dùng AI · AUTOCAT_AI_PER_RUN (mặc định 200) · AUTOCAT_AI_MODEL
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { products } from "@/db/schema";
import { CATEGORIES, canonicalCategory, confident, guessCategory, type Category } from "@/lib/autocategory";
import { db, ensureMigrated } from "@/lib/db";

export const autoCategoryEnabled = () => process.env.AUTOCAT !== "0";
export const autoCategoryAi = () => !!process.env.ANTHROPIC_API_KEY && process.env.AUTOCAT_AI !== "0";
const MODEL = () => process.env.AUTOCAT_AI_MODEL || process.env.REVIEW_AI_MODEL || "claude-haiku-4-5-20251001";
const BATCH = 50;

// Món AI đã thử mà không xếp được: không hỏi lại trong tiến trình này
const g = globalThis as unknown as { __autocatTried?: Set<number> };
const tried = (g.__autocatTried ??= new Set());

const SYSTEM = `Bạn phân loại sản phẩm bán trên Shopee/Lazada/TikTok Shop vào ĐÚNG MỘT danh mục cấp 1 trong danh sách cho trước.
Chỉ dùng tên danh mục y hệt trong danh sách. Không chắc chắn thì trả "?" cho món đó.
Trả lời chỉ một đối tượng JSON dạng {"<id>": "<tên danh mục>", ...}, không giải thích.`;

/** Đọc câu trả lời của AI: chỉ giữ tên danh mục hợp lệ */
export function parseAiCategories(text: string, ids: number[]): Map<number, Category> {
  const out = new Map<number, Category>();
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return out;
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(m[0]);
  } catch {
    return out;
  }
  for (const id of ids) {
    const v = j[String(id)];
    const c = typeof v === "string" ? canonicalCategory(v) : null;
    if (c) out.set(id, c);
  }
  return out;
}

async function askAi(items: { id: number; name: string }[], fetchImpl: typeof fetch): Promise<Map<number, Category>> {
  const list = items.map((i) => `${i.id}: ${i.name.replace(/\s+/g, " ").slice(0, 160)}`).join("\n");
  const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: AbortSignal.timeout(60_000),
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL(),
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: "user", content: `Danh mục:\n${CATEGORIES.join("\n")}\n\nSản phẩm (id: tên):\n${list}` }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  return parseAiCategories((data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join(""), items.map((i) => i.id));
}

async function setCategory(ids: number[], category: string, source: "auto" | "ai") {
  if (!ids.length) return;
  // Chỉ ghi vào món vẫn chưa có danh mục (tránh đè danh mục vừa có từ nguồn)
  await db
    .update(products)
    .set({ category, categorySource: source })
    .where(and(inArray(products.id, ids), sql`coalesce(${products.category}, '') = ''`));
}

export interface AutoCategoryResult {
  normalized: number;
  byRules: number;
  byAi: number;
  left: number;
  aiError?: string;
}

export async function runAutoCategory(opts: { limit?: number; ai?: boolean; fetchImpl?: typeof fetch } = {}): Promise<AutoCategoryResult> {
  await ensureMigrated();
  // Gộp tên tiếng Anh / khác hoa thường về tên chuẩn
  let normalized = 0;
  const cats = await db.select({ category: products.category }).from(products).where(sql`coalesce(${products.category}, '') <> ''`).groupBy(products.category);
  for (const { category } of cats) {
    const c = canonicalCategory(category);
    if (c && c !== category) {
      const r = await db.update(products).set({ category: c }).where(eq(products.category, category!)).returning({ id: products.id });
      normalized += r.length;
    }
  }

  const useAi = (opts.ai ?? true) && autoCategoryAi();
  const rows = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(sql`coalesce(${products.category}, '') = ''`)
    .orderBy(asc(products.id))
    .limit(opts.limit ?? 2000);

  const groups = new Map<Category, number[]>();
  const unsure: { id: number; name: string; guess: Category | null }[] = [];
  for (const r of rows) {
    const gs = guessCategory(r.name);
    if (gs && confident(gs)) (groups.get(gs.category) ?? groups.set(gs.category, []).get(gs.category)!).push(r.id);
    else unsure.push({ ...r, guess: gs?.category ?? null });
  }
  let byRules = 0;
  for (const [c, ids] of groups) {
    await setCategory(ids, c, "auto");
    byRules += ids.length;
  }

  let byAi = 0;
  let aiError: string | undefined;
  const fallback = new Map<Category, number[]>();
  if (useAi) {
    const perRun = Math.max(0, Number(process.env.AUTOCAT_AI_PER_RUN ?? 200) || 0);
    const todo = unsure.filter((u) => !tried.has(u.id)).slice(0, perRun);
    for (let i = 0; i < todo.length; i += BATCH) {
      const chunk = todo.slice(i, i + BATCH);
      try {
        const got = await askAi(chunk, opts.fetchImpl ?? fetch);
        const byCat = new Map<Category, number[]>();
        for (const it of chunk) {
          tried.add(it.id);
          const c = got.get(it.id);
          if (c) (byCat.get(c) ?? byCat.set(c, []).get(c)!).push(it.id);
        }
        for (const [c, ids] of byCat) {
          await setCategory(ids, c, "ai");
          byAi += ids.length;
        }
      } catch (err) {
        aiError = (err as Error).message.slice(0, 300);
        break;
      }
    }
  } else {
    // Không có AI: dùng kết quả từ khoá dù chưa thật chắc
    for (const u of unsure) if (u.guess) (fallback.get(u.guess) ?? fallback.set(u.guess, []).get(u.guess)!).push(u.id);
    for (const [c, ids] of fallback) {
      await setCategory(ids, c, "auto");
      byRules += ids.length;
    }
  }

  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(products).where(sql`coalesce(${products.category}, '') = ''`);
  return { normalized, byRules, byAi, left: Number(n), ...(aiError ? { aiError } : {}) };
}

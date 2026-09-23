import { sql } from "drizzle-orm";
import { rateLimits } from "@/db/schema";
import { db, ensureMigrated } from "./db";

/** Giới hạn tần suất dùng bảng rate_limits (chạy được cả khi nhiều tiến trình). Trả về true nếu được phép. */
export async function allow(key: string, limit: number, windowSec: number): Promise<boolean> {
  await ensureMigrated();
  const now = new Date();
  const reset = new Date(now.getTime() + windowSec * 1000);
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, resetAt: reset })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.resetAt} < ${now} then 1 else ${rateLimits.count} + 1 end`,
        resetAt: sql`case when ${rateLimits.resetAt} < ${now} then ${reset} else ${rateLimits.resetAt} end`,
      },
    })
    .returning({ count: rateLimits.count });
  return row.count <= limit;
}

export function clientIp(req: Request) {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "local").trim();
}

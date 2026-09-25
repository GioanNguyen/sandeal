import { redirectTo } from "@/lib/redirect";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { products } from "@/db/schema";
import { EMAIL_RE, getCurrentUser, normalizeEmail, sendLoginLink, upsertWatch } from "@/lib/auth";
import { db, ensureMigrated } from "@/lib/db";
import { allow, clientIp } from "@/lib/ratelimit";

/** Nhận JSON (từ JS) hoặc form thường (khi JS chưa tải xong) */
export async function POST(req: Request) {
  const isForm = !(req.headers.get("content-type") ?? "").includes("json");
  const body: Record<string, unknown> | null = isForm
    ? Object.fromEntries((await req.formData().catch(() => new FormData())).entries())
    : await req.json().catch(() => null);
  const pid = Number(body?.productId);
  const done = (mode: "saved" | "verify") =>
    isForm ? redirectTo(`/product/${pid}?watch=${mode}`, 303) : NextResponse.json({ ok: true, mode });
  const fail = (status: number, error: string) =>
    isForm
      ? redirectTo(`/product/${pid}?watch=error&msg=${encodeURIComponent(error)}`, 303)
      : NextResponse.json({ error }, { status });

  if (body?.website) return done("verify"); // bot điền ô ẩn

  const productId = Number(body?.productId);
  const targetPrice = Number(body?.targetPrice);
  if (!Number.isFinite(targetPrice) || targetPrice < 1000) {
    return fail(400, "Giá mục tiêu không hợp lệ");
  }
  await ensureMigrated();
  const [product] = await db.select({ id: products.id, name: products.name }).from(products).where(eq(products.id, productId)).limit(1);
  if (!product) return fail(404, "Không tìm thấy sản phẩm");

  const user = await getCurrentUser();
  if (user) {
    if (!(await allow(`watch:u:${user.id}`, 60, 3600))) {
      return fail(429, "Bạn thao tác quá nhanh, thử lại sau.");
    }
    await upsertWatch(user.id, productId, targetPrice);
    return done("saved");
  }

  const email = normalizeEmail(body?.email);
  if (!EMAIL_RE.test(email)) return fail(400, "Email không hợp lệ");
  const ip = clientIp(req);
  if (!(await allow(`watch:ip:${ip}`, 10, 3600)) || !(await allow(`mail:${email}`, 5, 3600))) {
    return fail(429, "Bạn gửi quá nhiều yêu cầu, thử lại sau ít phút.");
  }
  await sendLoginLink(email, { productId, targetPrice, productName: product.name });
  return done("verify");
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const productId = Number(body?.productId);
  const targetPrice = Number(body?.targetPrice);

  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Email không hợp lệ" }, { status: 400 });
  if (!Number.isFinite(targetPrice) || targetPrice <= 0) return NextResponse.json({ error: "Giá mục tiêu không hợp lệ" }, { status: 400 });
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return NextResponse.json({ error: "Không tìm thấy sản phẩm" }, { status: 404 });

  const watch = await prisma.watch.upsert({
    where: { email_productId: { email, productId } },
    create: { email, productId, targetPrice },
    update: { targetPrice, lastNotifiedAt: null },
  });
  return NextResponse.json({ ok: true, id: watch.id });
}

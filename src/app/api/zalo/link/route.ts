import { eq } from "drizzle-orm";
import { subscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirectTo } from "@/lib/redirect";
import { getSubscription } from "@/lib/subscription";
import { newLinkCode, zaloEnabled } from "@/lib/zalo";

/** Tạo mã liên kết; trang Sở thích hiện mã + nút mở OA để người dùng gửi mã */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return redirectTo("/login?next=/account/so-thich", 303);
  if (!zaloEnabled()) return redirectTo("/account/so-thich?zl=off#zalo", 303);
  await getSubscription(user.id);
  await db.update(subscriptions).set({ zaloLinkCode: newLinkCode() }).where(eq(subscriptions.userId, user.id));
  return redirectTo("/account/so-thich#zalo", 303);
}

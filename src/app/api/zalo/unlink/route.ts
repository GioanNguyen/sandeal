import { eq } from "drizzle-orm";
import { subscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirectTo } from "@/lib/redirect";

export async function POST() {
  const user = await getCurrentUser();
  if (user) await db.update(subscriptions).set({ zaloUserId: null, zaloLinkCode: null, zaloLastSeenAt: null }).where(eq(subscriptions.userId, user.id));
  return redirectTo("/account/so-thich#zalo", 303);
}

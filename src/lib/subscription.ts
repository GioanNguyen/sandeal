import { eq } from "drizzle-orm";
import { subscriptions, type Subscription } from "@/db/schema";
import { db, ensureMigrated } from "./db";

export async function getSubscription(userId: number): Promise<Subscription> {
  await ensureMigrated();
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (row) return row;
  const [created] = await db.insert(subscriptions).values({ userId }).onConflictDoNothing().returning();
  return created ?? (await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)))[0];
}

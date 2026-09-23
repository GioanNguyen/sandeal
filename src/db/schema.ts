import {
  doublePrecision, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    platform: text("platform").notNull(), // shopee | lazada | tiktok
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    imageUrl: text("image_url"),
    shopName: text("shop_name"),
    category: text("category"),
    price: doublePrecision("price").notNull(),
    originalPrice: doublePrecision("original_price"),
    discountPct: doublePrecision("discount_pct").notNull().default(0),
    rating: doublePrecision("rating"),
    sold: integer("sold"),
    commissionRate: doublePrecision("commission_rate"),
    affiliateUrl: text("affiliate_url").notNull(),
    dealScore: doublePrecision("deal_score").notNull().default(0),
    realDropPct: doublePrecision("real_drop_pct").notNull().default(0),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    createdAt: ts("created_at").notNull().defaultNow(),
    telegramPostedAt: ts("telegram_posted_at"),
  },
  (t) => [
    uniqueIndex("products_platform_ext_uq").on(t.platform, t.externalId),
    index("products_score_idx").on(t.dealScore),
    index("products_cat_idx").on(t.platform, t.category),
  ],
);

export const pricePoints = pgTable(
  "price_points",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    price: doublePrecision("price").notNull(),
    capturedAt: ts("captured_at").notNull().defaultNow(),
  },
  (t) => [index("price_points_product_idx").on(t.productId, t.capturedAt)],
);

export const vouchers = pgTable(
  "vouchers",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    platform: text("platform").notNull(),
    code: text("code"),
    title: text("title").notNull(),
    description: text("description"),
    discountText: text("discount_text"),
    minSpend: doublePrecision("min_spend"),
    startAt: ts("start_at"),
    endAt: ts("end_at"),
    affiliateUrl: text("affiliate_url").notNull(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("vouchers_src_ext_uq").on(t.source, t.externalId), index("vouchers_end_idx").on(t.platform, t.endAt)],
);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** Link đăng nhập qua email (chỉ lưu hash của token) */
export const loginTokens = pgTable("login_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  email: text("email").notNull(),
  expiresAt: ts("expires_at").notNull(),
  pendingWatch: jsonb("pending_watch").$type<{ productId: number; targetPrice: number } | null>(),
  usedAt: ts("used_at"),
});

export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: ts("expires_at").notNull(),
});

export const watches = pgTable(
  "watches",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    targetPrice: doublePrecision("target_price").notNull(),
    lastNotifiedAt: ts("last_notified_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("watches_user_product_uq").on(t.userId, t.productId)],
);

/** Mỗi lượt bấm "Mua" đi qua /go/[id] */
export const clicks = pgTable(
  "clicks",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
    voucherId: integer("voucher_id").references(() => vouchers.id, { onDelete: "set null" }),
    platform: text("platform").notNull(),
    referer: text("referer"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("clicks_created_idx").on(t.createdAt)],
);

/** Đơn hàng / hoa hồng lấy từ báo cáo của mạng affiliate */
export const conversions = pgTable(
  "conversions",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    platform: text("platform").notNull(),
    orderAmount: doublePrecision("order_amount").notNull().default(0),
    commission: doublePrecision("commission").notNull().default(0),
    status: text("status").notNull().default("pending"),
    purchasedAt: ts("purchased_at").notNull(),
    raw: jsonb("raw"),
  },
  (t) => [uniqueIndex("conversions_src_ext_uq").on(t.source, t.externalId), index("conversions_time_idx").on(t.purchasedAt)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  resetAt: ts("reset_at").notNull(),
});

export type Product = typeof products.$inferSelect;
export type Voucher = typeof vouchers.$inferSelect;
export type PricePoint = typeof pricePoints.$inferSelect;

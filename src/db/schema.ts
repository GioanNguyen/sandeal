import {
  boolean, doublePrecision, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex,
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
    /** Ảnh phụ (ảnh thứ 2 trở đi) – hiện khi rê chuột lên thẻ */
    images: jsonb("images").$type<string[]>(),
    shopName: text("shop_name"),
    /** mall (chính hãng) | preferred (shop yêu thích) | null */
    shopType: text("shop_type"),
    shopRating: doublePrecision("shop_rating"),
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
    /** Khoá nhóm sản phẩm giống nhau giữa các sàn (dùng để so sánh giá) */
    groupKey: text("group_key"),
  },
  (t) => [
    index("products_group_idx").on(t.groupKey),
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
    /** Chuẩn hoá để máy tính giá dùng: percent | fixed | freeship | cashback */
    discountType: text("discount_type"),
    discountValue: doublePrecision("discount_value"),
    maxDiscount: doublePrecision("max_discount"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("vouchers_src_ext_uq").on(t.source, t.externalId), index("vouchers_end_idx").on(t.platform, t.endAt)],
);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  /** Tên hiển thị trong cộng đồng */
  name: text("name"),
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

/** Link người dùng dán vào mà chưa có dữ liệu – worker sẽ thử tra cứu lại */
export const productRequests = pgTable(
  "product_requests",
  {
    id: serial("id").primaryKey(),
    platform: text("platform").notNull(),
    externalId: text("external_id").notNull(),
    shopId: text("shop_id"),
    url: text("url").notNull(),
    count: integer("count").notNull().default(1),
    attempts: integer("attempts").notNull().default(0),
    productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("product_requests_uq").on(t.platform, t.externalId)],
);

/** Sở thích săn deal + kênh nhận thông báo của từng người dùng */
export const subscriptions = pgTable("subscriptions", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  keywords: text("keywords").notNull().default(""),
  categories: jsonb("categories").$type<string[]>().notNull().default([]),
  platforms: jsonb("platforms").$type<string[]>().notNull().default([]),
  minDrop: integer("min_drop").notNull().default(15),
  maxPrice: doublePrecision("max_price"),
  emailDigest: boolean("email_digest").notNull().default(false),
  telegramDigest: boolean("telegram_digest").notNull().default(false),
  pushDigest: boolean("push_digest").notNull().default(false),
  saleReminder: boolean("sale_reminder").notNull().default(false),
  telegramChatId: text("telegram_chat_id"),
  telegramLinkCode: text("telegram_link_code"),
  lastDigestAt: ts("last_digest_at"),
  lastSaleReminderKey: text("last_sale_reminder_key"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Deal đã gửi cho người dùng (tránh gửi trùng trong bản tin) */
export const sentDeals = pgTable(
  "sent_deals",
  {
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    sentAt: ts("sent_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sent_deals_uq").on(t.userId, t.productId)],
);

/** Bình chọn deal: +1 hot, -1 không đáng */
export const votes = pgTable(
  "votes",
  {
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    value: integer("value").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("votes_uq").on(t.userId, t.productId), index("votes_product_idx").on(t.productId)],
);

/** Deal do người dùng chia sẻ */
export const posts = pgTable(
  "posts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    note: text("note").notNull().default(""),
    hidden: boolean("hidden").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("posts_product_uq").on(t.productId), index("posts_created_idx").on(t.createdAt)],
);

/** Đăng ký thông báo đẩy (Web Push) của từng thiết bị */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    endpoint: text("endpoint").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("push_user_idx").on(t.userId)],
);

/** Lịch sử đăng deal lên mạng xã hội (tránh đăng lặp) */
export const socialPosts = pgTable(
  "social_posts",
  {
    id: serial("id").primaryKey(),
    channel: text("channel").notNull(), // telegram | facebook
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    postedAt: ts("posted_at").notNull().defaultNow(),
    externalId: text("external_id"),
    error: text("error"),
  },
  (t) => [index("social_posts_idx").on(t.channel, t.productId, t.postedAt)],
);

/** Từ khoá khách đã tìm (để gợi ý "đang được tìm nhiều") – không lưu thông tin người tìm */
export const searchLog = pgTable(
  "search_log",
  {
    id: serial("id").primaryKey(),
    q: text("q").notNull(), // đã chuẩn hoá: chữ thường, gọn khoảng trắng
    results: integer("results").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("search_log_idx").on(t.createdAt)],
);

/** Lượt xem sản phẩm theo khách ẩn danh (mã ngẫu nhiên trong cookie) – dùng cho "Người xem món này cũng xem" */
export const productViews = pgTable(
  "product_views",
  {
    id: serial("id").primaryKey(),
    visitor: text("visitor").notNull(),
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    day: text("day").notNull(), // YYYY-MM-DD giờ VN: mỗi khách chỉ tính 1 lượt/món/ngày
    createdAt: ts("created_at").notNull().defaultNow(),
    /** Lần xem gần nhất trong ngày (để đếm "người xem trong 1 giờ qua") */
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("product_views_uq").on(t.visitor, t.productId, t.day),
    index("product_views_product_idx").on(t.productId, t.createdAt),
    index("product_views_visitor_idx").on(t.visitor),
    index("product_views_recent_idx").on(t.productId, t.lastSeenAt),
  ],
);

/** Danh sách deal khách gom lại để chia sẻ (link ngắn /ds/<slug>) */
export const sharedLists = pgTable(
  "shared_lists",
  {
    slug: text("slug").primaryKey(),
    title: text("title").notNull(),
    productIds: jsonb("product_ids").$type<number[]>().notNull(),
    views: integer("views").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("shared_lists_created_idx").on(t.createdAt)],
);

export type Product = typeof products.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Voucher = typeof vouchers.$inferSelect;
export type PricePoint = typeof pricePoints.$inferSelect;

CREATE TABLE "clicks" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer,
	"voucher_id" integer,
	"platform" text NOT NULL,
	"referer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversions" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"platform" text NOT NULL,
	"order_amount" double precision DEFAULT 0 NOT NULL,
	"commission" double precision DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"purchased_at" timestamp with time zone NOT NULL,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "login_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"pending_watch" jsonb,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "price_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"price" double precision NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"image_url" text,
	"shop_name" text,
	"category" text,
	"price" double precision NOT NULL,
	"original_price" double precision,
	"discount_pct" double precision DEFAULT 0 NOT NULL,
	"rating" double precision,
	"sold" integer,
	"commission_rate" double precision,
	"affiliate_url" text NOT NULL,
	"deal_score" double precision DEFAULT 0 NOT NULL,
	"real_drop_pct" double precision DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"telegram_posted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vouchers" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"platform" text NOT NULL,
	"code" text,
	"title" text NOT NULL,
	"description" text,
	"discount_text" text,
	"min_spend" double precision,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"affiliate_url" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watches" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"target_price" double precision NOT NULL,
	"last_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clicks" ADD CONSTRAINT "clicks_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clicks" ADD CONSTRAINT "clicks_voucher_id_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."vouchers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_points" ADD CONSTRAINT "price_points_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watches" ADD CONSTRAINT "watches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watches" ADD CONSTRAINT "watches_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clicks_created_idx" ON "clicks" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversions_src_ext_uq" ON "conversions" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "conversions_time_idx" ON "conversions" USING btree ("purchased_at");--> statement-breakpoint
CREATE INDEX "price_points_product_idx" ON "price_points" USING btree ("product_id","captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "products_platform_ext_uq" ON "products" USING btree ("platform","external_id");--> statement-breakpoint
CREATE INDEX "products_score_idx" ON "products" USING btree ("deal_score");--> statement-breakpoint
CREATE INDEX "products_cat_idx" ON "products" USING btree ("platform","category");--> statement-breakpoint
CREATE UNIQUE INDEX "vouchers_src_ext_uq" ON "vouchers" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "vouchers_end_idx" ON "vouchers" USING btree ("platform","end_at");--> statement-breakpoint
CREATE UNIQUE INDEX "watches_user_product_uq" ON "watches" USING btree ("user_id","product_id");
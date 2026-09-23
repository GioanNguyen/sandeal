CREATE TABLE "product_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"external_id" text NOT NULL,
	"shop_id" text,
	"url" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"product_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sent_deals" (
	"user_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"keywords" text DEFAULT '' NOT NULL,
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"platforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"min_drop" integer DEFAULT 15 NOT NULL,
	"max_price" double precision,
	"email_digest" boolean DEFAULT false NOT NULL,
	"telegram_digest" boolean DEFAULT false NOT NULL,
	"sale_reminder" boolean DEFAULT false NOT NULL,
	"telegram_chat_id" text,
	"telegram_link_code" text,
	"last_digest_at" timestamp with time zone,
	"last_sale_reminder_key" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "group_key" text;--> statement-breakpoint
ALTER TABLE "product_requests" ADD CONSTRAINT "product_requests_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sent_deals" ADD CONSTRAINT "sent_deals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sent_deals" ADD CONSTRAINT "sent_deals_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_requests_uq" ON "product_requests" USING btree ("platform","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sent_deals_uq" ON "sent_deals" USING btree ("user_id","product_id");--> statement-breakpoint
CREATE INDEX "products_group_idx" ON "products" USING btree ("group_key");
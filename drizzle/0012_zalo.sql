CREATE TABLE "kv_store" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "zalo_user_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "zalo_link_code" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "zalo_last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "zalo_alerts" boolean DEFAULT true NOT NULL;
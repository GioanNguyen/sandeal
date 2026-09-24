ALTER TABLE "product_views" ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "product_views_recent_idx" ON "product_views" USING btree ("product_id","last_seen_at");--> statement-breakpoint
UPDATE "product_views" SET "last_seen_at" = "created_at";

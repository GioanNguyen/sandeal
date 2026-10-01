CREATE TABLE "product_review_meta" (
	"product_id" integer PRIMARY KEY NOT NULL,
	"rating_count" integer,
	"star_counts" jsonb,
	"ai_summary" jsonb,
	"ai_review_count" integer DEFAULT 0 NOT NULL,
	"ai_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"hash" text NOT NULL,
	"rating" integer NOT NULL,
	"body" text NOT NULL,
	"variant" text,
	"has_media" boolean DEFAULT false NOT NULL,
	"posted_at" timestamp with time zone,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_review_meta" ADD CONSTRAINT "product_review_meta_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_reviews_hash_uq" ON "product_reviews" USING btree ("product_id","hash");--> statement-breakpoint
CREATE INDEX "product_reviews_product_idx" ON "product_reviews" USING btree ("product_id","observed_at");
CREATE TABLE "social_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"product_id" integer NOT NULL,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"external_id" text,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "social_posts_idx" ON "social_posts" USING btree ("channel","product_id","posted_at");
CREATE TABLE "product_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"visitor" text NOT NULL,
	"product_id" integer NOT NULL,
	"day" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"q" text NOT NULL,
	"results" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_views" ADD CONSTRAINT "product_views_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_views_uq" ON "product_views" USING btree ("visitor","product_id","day");--> statement-breakpoint
CREATE INDEX "product_views_product_idx" ON "product_views" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "product_views_visitor_idx" ON "product_views" USING btree ("visitor");--> statement-breakpoint
CREATE INDEX "search_log_idx" ON "search_log" USING btree ("created_at");
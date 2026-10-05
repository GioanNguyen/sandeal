CREATE TABLE "conversion_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"platform" text NOT NULL,
	"order_id" text NOT NULL,
	"line_key" text NOT NULL,
	"item_id" text,
	"item_name" text,
	"shop_id" text,
	"price" double precision DEFAULT 0 NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"commission" double precision DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"purchased_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	"sub_ids" text,
	"product_id" integer,
	"click_id" integer,
	"channel" text,
	"attribution" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clicks" ADD COLUMN "channel" text;--> statement-breakpoint
ALTER TABLE "conversion_items" ADD CONSTRAINT "conversion_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversion_items_line_uq" ON "conversion_items" USING btree ("platform","order_id","line_key");--> statement-breakpoint
CREATE INDEX "conversion_items_time_idx" ON "conversion_items" USING btree ("purchased_at");--> statement-breakpoint
CREATE INDEX "conversion_items_product_idx" ON "conversion_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "clicks_product_idx" ON "clicks" USING btree ("product_id","created_at");
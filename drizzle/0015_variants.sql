CREATE TABLE "product_variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"sku_id" text,
	"price" double precision NOT NULL,
	"original_price" double precision,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variant_price_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"variant_id" integer NOT NULL,
	"price" double precision NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "watches" ADD COLUMN "variant_id" integer;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_price_points" ADD CONSTRAINT "variant_price_points_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_uq" ON "product_variants" USING btree ("product_id","key");--> statement-breakpoint
CREATE INDEX "variant_price_points_idx" ON "variant_price_points" USING btree ("variant_id","captured_at");--> statement-breakpoint
ALTER TABLE "watches" ADD CONSTRAINT "watches_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;
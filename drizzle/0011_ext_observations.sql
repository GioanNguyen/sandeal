CREATE TABLE "price_observations" (
	"id" serial PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"external_id" text NOT NULL,
	"product_id" integer,
	"price" double precision NOT NULL,
	"observer" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "price_source" text DEFAULT 'api' NOT NULL;--> statement-breakpoint
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_obs_ref_idx" ON "price_observations" USING btree ("platform","external_id","created_at");--> statement-breakpoint
CREATE INDEX "price_obs_time_idx" ON "price_observations" USING btree ("created_at");
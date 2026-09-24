CREATE TABLE "sale_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"sale_key" text NOT NULL,
	"sale_name" text NOT NULL,
	"price_at_create" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "weekly_summary" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "last_weekly_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sale_alerts" ADD CONSTRAINT "sale_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_alerts" ADD CONSTRAINT "sale_alerts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sale_alerts_uq" ON "sale_alerts" USING btree ("user_id","product_id","sale_key");--> statement-breakpoint
CREATE INDEX "sale_alerts_pending_idx" ON "sale_alerts" USING btree ("sale_key","sent_at");
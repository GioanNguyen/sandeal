ALTER TABLE "products" ADD COLUMN "hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "hidden_reason" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "hidden_at" timestamp with time zone;
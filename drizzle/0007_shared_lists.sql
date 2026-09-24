CREATE TABLE "shared_lists" (
	"slug" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"product_ids" jsonb NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "shared_lists_created_idx" ON "shared_lists" USING btree ("created_at");
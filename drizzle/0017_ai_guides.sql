CREATE TABLE "ai_guides" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"topic" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"kicker" text NOT NULL,
	"points" jsonb NOT NULL,
	"scene" jsonb NOT NULL,
	"body" jsonb NOT NULL,
	"related" text DEFAULT 'deep' NOT NULL,
	"publish_date" text,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_guides_slug_uq" ON "ai_guides" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "ai_guides_status_idx" ON "ai_guides" USING btree ("status");
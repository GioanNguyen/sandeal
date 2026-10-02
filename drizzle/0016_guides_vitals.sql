CREATE TABLE "guide_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"channel" text NOT NULL,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"external_id" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "web_vitals" (
	"id" serial PRIMARY KEY NOT NULL,
	"metric" text NOT NULL,
	"value" double precision NOT NULL,
	"rating" text NOT NULL,
	"page" text NOT NULL,
	"path" text NOT NULL,
	"device" text NOT NULL,
	"net" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "guide_posts_idx" ON "guide_posts" USING btree ("slug","channel");--> statement-breakpoint
CREATE INDEX "web_vitals_idx" ON "web_vitals" USING btree ("created_at","metric");
CREATE TABLE "indexnow_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"urls" integer NOT NULL,
	"status" integer NOT NULL,
	"error" text,
	"sample" jsonb,
	"hubs" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX "indexnow_log_at_idx" ON "indexnow_log" USING btree ("at");
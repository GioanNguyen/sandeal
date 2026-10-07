CREATE TABLE "request_watchers" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"user_id" integer,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "product_requests" ADD COLUMN "name_hint" text;--> statement-breakpoint
ALTER TABLE "request_watchers" ADD CONSTRAINT "request_watchers_request_id_product_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."product_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_watchers" ADD CONSTRAINT "request_watchers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "request_watchers_uq" ON "request_watchers" USING btree ("request_id","email");--> statement-breakpoint
CREATE INDEX "request_watchers_pending_idx" ON "request_watchers" USING btree ("notified_at");
CREATE TABLE "product_embeddings" (
	"product_id" integer PRIMARY KEY NOT NULL,
	"image_url" text NOT NULL,
	"model" text NOT NULL,
	"vec" bytea,
	"scale" double precision,
	"failures" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_embeddings" ADD CONSTRAINT "product_embeddings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_embeddings_model_idx" ON "product_embeddings" USING btree ("model","updated_at");
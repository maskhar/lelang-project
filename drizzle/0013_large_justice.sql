CREATE TABLE "app"."webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(60) NOT NULL,
	"url" text NOT NULL,
	"secret_ciphertext" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "app"."webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "app"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_endpoints_name_uidx" ON "app"."webhook_endpoints" USING btree ("name");
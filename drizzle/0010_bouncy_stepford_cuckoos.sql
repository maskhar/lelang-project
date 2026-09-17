ALTER TABLE "app"."leads" ADD COLUMN "buyer_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."leads" ADD CONSTRAINT "leads_buyer_id_profiles_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "app"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leads_buyer_idx" ON "app"."leads" USING btree ("buyer_id","created_at");
ALTER TYPE "app"."user_role" ADD VALUE 'owner';--> statement-breakpoint
ALTER TYPE "app"."user_role" ADD VALUE 'agent';--> statement-breakpoint
ALTER TABLE "app"."properties" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."properties" ADD CONSTRAINT "properties_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "app"."profiles"("id") ON DELETE no action ON UPDATE no action;
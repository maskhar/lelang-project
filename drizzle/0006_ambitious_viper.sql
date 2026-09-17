ALTER TABLE "app"."profiles" ADD COLUMN "avatar_url" varchar(2048);
--> statement-breakpoint
ALTER TABLE "app"."user_sessions" ADD COLUMN "ip_address" varchar(64);

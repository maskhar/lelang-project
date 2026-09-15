DROP INDEX "app"."profiles_email_uidx";--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_email_uidx" ON "app"."profiles" USING btree (lower("email"));--> statement-breakpoint
ALTER TABLE "app"."profiles" ADD CONSTRAINT "profiles_email_canonical" CHECK ("app"."profiles"."email" = lower("app"."profiles"."email"));
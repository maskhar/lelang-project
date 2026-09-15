CREATE TABLE "app"."oauth_transactions" (
	"state_hash" varchar(64) PRIMARY KEY NOT NULL,
	"browser_hash" varchar(64) NOT NULL,
	"nonce_hash" varchar(64) NOT NULL,
	"verifier_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."user_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(32) DEFAULT 'google' NOT NULL,
	"provider_subject" varchar(255) NOT NULL,
	"email" varchar(320) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_identities_google_only" CHECK ("app"."user_identities"."provider" = 'google')
);
--> statement-breakpoint
DROP TABLE "app"."auth_tokens" CASCADE;--> statement-breakpoint
ALTER TABLE "app"."user_identities" ADD CONSTRAINT "user_identities_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oauth_transactions_expiry_idx" ON "app"."oauth_transactions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_identities_subject_uidx" ON "app"."user_identities" USING btree ("provider","provider_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "user_identities_user_provider_uidx" ON "app"."user_identities" USING btree ("user_id","provider");--> statement-breakpoint
ALTER TABLE "app"."profiles" DROP COLUMN "password_hash";
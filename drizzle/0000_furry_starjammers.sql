CREATE SCHEMA "app";
--> statement-breakpoint
CREATE TYPE "app"."availability_status" AS ENUM('available', 'sold');--> statement-breakpoint
CREATE TYPE "app"."lead_status" AS ENUM('new', 'contacted', 'closed', 'spam');--> statement-breakpoint
CREATE TYPE "app"."media_status" AS ENUM('pending', 'ready', 'rejected', 'deleted');--> statement-breakpoint
CREATE TYPE "app"."outbox_status" AS ENUM('pending', 'processing', 'processed', 'dead_letter');--> statement-breakpoint
CREATE TYPE "app"."publication_status" AS ENUM('draft', 'pending_review', 'revision_required', 'scheduled', 'published', 'paused', 'rejected', 'archived');--> statement-breakpoint
CREATE TYPE "app"."review_status" AS ENUM('draft', 'pending', 'approved', 'revision_required', 'rejected');--> statement-breakpoint
CREATE TYPE "app"."sale_mode" AS ENUM('auction', 'direct_sale');--> statement-breakpoint
CREATE TYPE "app"."user_role" AS ENUM('editor', 'admin');--> statement-breakpoint
CREATE TYPE "app"."user_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TABLE "app"."audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(80) NOT NULL,
	"entity_id" uuid,
	"request_id" varchar(100),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(320),
	"phone" varchar(30),
	"message" text,
	"consent_at" timestamp with time zone NOT NULL,
	"status" "app"."lead_status" DEFAULT 'new' NOT NULL,
	"assigned_to" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(120) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "app"."outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(160) NOT NULL,
	"created_by" uuid NOT NULL,
	"sale_mode" "app"."sale_mode" NOT NULL,
	"publication_status" "app"."publication_status" DEFAULT 'draft' NOT NULL,
	"availability_status" "app"."availability_status" DEFAULT 'available' NOT NULL,
	"type" varchar(40) NOT NULL,
	"province_code" varchar(10) NOT NULL,
	"city_code" varchar(20) NOT NULL,
	"asking_price" bigint NOT NULL,
	"published_revision_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "properties_price_safe" CHECK ("app"."properties"."asking_price" between 1 and 9007199254740991),
	CONSTRAINT "properties_version_positive" CHECK ("app"."properties"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "app"."property_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"bucket" varchar(100) NOT NULL,
	"object_path" text NOT NULL,
	"content_type" varchar(100) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"checksum_sha256" varchar(64),
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"is_cover" boolean DEFAULT false NOT NULL,
	"status" "app"."media_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_size_and_order" CHECK ("app"."property_media"."size_bytes" between 1 and 5242880 and "app"."property_media"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."property_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"title" varchar(120) NOT NULL,
	"description" text NOT NULL,
	"address" text,
	"land_area_m2" integer DEFAULT 0 NOT NULL,
	"building_area_m2" integer DEFAULT 0 NOT NULL,
	"bedroom_count" smallint DEFAULT 0 NOT NULL,
	"auction_starts_at" timestamp with time zone,
	"auction_ends_at" timestamp with time zone,
	"status" "app"."review_status" DEFAULT 'draft' NOT NULL,
	"reviewed_by" uuid,
	"review_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revision_valid_numbers" CHECK ("app"."property_revisions"."revision_number" > 0 and "app"."property_revisions"."land_area_m2" >= 0 and "app"."property_revisions"."building_area_m2" >= 0 and "app"."property_revisions"."bedroom_count" >= 0),
	CONSTRAINT "revision_valid_schedule" CHECK (("app"."property_revisions"."auction_starts_at" is null and "app"."property_revisions"."auction_ends_at" is null) or ("app"."property_revisions"."auction_starts_at" is not null and "app"."property_revisions"."auction_ends_at" is not null and "app"."property_revisions"."auction_ends_at" > "app"."property_revisions"."auction_starts_at"))
);
--> statement-breakpoint
CREATE TABLE "app"."auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"purpose" varchar(32) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" varchar(120) NOT NULL,
	"phone" varchar(30),
	"password_hash" varchar(255) NOT NULL,
	"email_verified_at" timestamp with time zone,
	"status" "app"."user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."user_roles" (
	"user_id" uuid NOT NULL,
	"role" "app"."user_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "app"."user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_hash" varchar(64),
	"user_agent_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."audit_logs" ADD CONSTRAINT "audit_logs_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "app"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."leads" ADD CONSTRAINT "leads_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "app"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."leads" ADD CONSTRAINT "leads_assigned_to_profiles_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "app"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."properties" ADD CONSTRAINT "properties_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."property_media" ADD CONSTRAINT "property_media_revision_id_property_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "app"."property_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."property_revisions" ADD CONSTRAINT "property_revisions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "app"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."property_revisions" ADD CONSTRAINT "property_revisions_reviewed_by_profiles_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "app"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_roles" ADD CONSTRAINT "user_roles_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_sessions" ADD CONSTRAINT "user_sessions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "app"."audit_logs" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "leads_property_status_idx" ON "app"."leads" USING btree ("property_id","status","created_at");--> statement-breakpoint
CREATE INDEX "outbox_events_claim_idx" ON "app"."outbox_events" USING btree ("status","available_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "properties_slug_uidx" ON "app"."properties" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "properties_catalog_idx" ON "app"."properties" USING btree ("publication_status","availability_status","published_at","id");--> statement-breakpoint
CREATE INDEX "properties_location_idx" ON "app"."properties" USING btree ("province_code","city_code");--> statement-breakpoint
CREATE INDEX "properties_price_idx" ON "app"."properties" USING btree ("asking_price");--> statement-breakpoint
CREATE UNIQUE INDEX "property_media_cover_uidx" ON "app"."property_media" USING btree ("revision_id") WHERE "app"."property_media"."is_cover" = true and "app"."property_media"."status" <> 'deleted';--> statement-breakpoint
CREATE UNIQUE INDEX "property_media_object_uidx" ON "app"."property_media" USING btree ("bucket","object_path");--> statement-breakpoint
CREATE INDEX "property_media_revision_idx" ON "app"."property_media" USING btree ("revision_id","status","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "property_revisions_number_uidx" ON "app"."property_revisions" USING btree ("property_id","revision_number");--> statement-breakpoint
CREATE INDEX "property_revisions_review_idx" ON "app"."property_revisions" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_tokens_token_hash_uidx" ON "app"."auth_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_tokens_user_purpose_idx" ON "app"."auth_tokens" USING btree ("user_id","purpose","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_email_uidx" ON "app"."profiles" USING btree ("email");--> statement-breakpoint
CREATE INDEX "profiles_status_idx" ON "app"."profiles" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "user_sessions_token_hash_uidx" ON "app"."user_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "user_sessions_user_expiry_idx" ON "app"."user_sessions" USING btree ("user_id","expires_at");
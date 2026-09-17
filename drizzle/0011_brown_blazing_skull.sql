CREATE TABLE "app"."property_watchlists" (
	"buyer_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_watchlists_buyer_id_property_id_pk" PRIMARY KEY("buyer_id","property_id")
);
--> statement-breakpoint
ALTER TABLE "app"."property_watchlists" ADD CONSTRAINT "property_watchlists_buyer_id_profiles_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "app"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."property_watchlists" ADD CONSTRAINT "property_watchlists_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "app"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "property_watchlists_buyer_idx" ON "app"."property_watchlists" USING btree ("buyer_id","created_at");
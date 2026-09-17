CREATE TABLE "app"."property_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"assigned_by" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unassigned_at" timestamp with time zone,
	"note" varchar(1000)
);
--> statement-breakpoint
ALTER TABLE "app"."property_assignments" ADD CONSTRAINT "property_assignments_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "app"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."property_assignments" ADD CONSTRAINT "property_assignments_agent_id_profiles_id_fk" FOREIGN KEY ("agent_id") REFERENCES "app"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."property_assignments" ADD CONSTRAINT "property_assignments_assigned_by_profiles_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "app"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "property_assignments_agent_idx" ON "app"."property_assignments" USING btree ("agent_id","unassigned_at");--> statement-breakpoint
CREATE INDEX "property_assignments_property_idx" ON "app"."property_assignments" USING btree ("property_id","unassigned_at");
ALTER TABLE "app"."properties" ADD COLUMN "sku" varchar(40);
--> statement-breakpoint
WITH numbered AS (
  SELECT "id", row_number() OVER (ORDER BY "created_at", "id") AS sequence
  FROM "app"."properties"
)
UPDATE "app"."properties" AS property
SET "sku" = 'LP-' || lpad(numbered.sequence::text, greatest(8, length(numbered.sequence::text)), '0')
FROM numbered WHERE property."id" = numbered."id";
--> statement-breakpoint
ALTER TABLE "app"."properties" ALTER COLUMN "sku" SET DEFAULT 'LP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
--> statement-breakpoint
ALTER TABLE "app"."properties" ALTER COLUMN "sku" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "properties_sku_uidx" ON "app"."properties" USING btree ("sku");

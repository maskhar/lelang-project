CREATE TABLE "app"."auth_rate_limits" (
	"key_hash" varchar(64) PRIMARY KEY NOT NULL,
	"attempts" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "auth_rate_limits_positive" CHECK ("app"."auth_rate_limits"."attempts" > 0)
);

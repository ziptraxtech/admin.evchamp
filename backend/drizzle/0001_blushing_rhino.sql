CREATE TYPE "public"."charger_kind" AS ENUM('AC', 'DC');--> statement-breakpoint
CREATE TYPE "public"."price_type" AS ENUM('fixed', 'variable');--> statement-breakpoint
ALTER TABLE "chargers" ADD COLUMN "name" varchar(120);--> statement-breakpoint
ALTER TABLE "chargers" ADD COLUMN "charger_kind" charger_kind DEFAULT 'AC' NOT NULL;--> statement-breakpoint
ALTER TABLE "chargers" ADD COLUMN "is_public" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "price_groups" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "price_groups" ADD COLUMN "price_type" "price_type" DEFAULT 'fixed' NOT NULL;
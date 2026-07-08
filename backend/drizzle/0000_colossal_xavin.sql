CREATE TYPE "public"."charger_status" AS ENUM('online', 'offline', 'faulted');--> statement-breakpoint
CREATE TYPE "public"."charges_bearer" AS ENUM('customer', 'operator');--> statement-breakpoint
CREATE TYPE "public"."connector_status" AS ENUM('available', 'preparing', 'charging', 'faulted', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('razorpay', 'paytm', 'upi');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('created', 'captured', 'committed', 'settled', 'refunded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('pending_start', 'charging', 'completed', 'stopped_early', 'failed_to_start');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'cpo', 'operator');--> statement-breakpoint
CREATE TABLE "chargers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chargebox_id" varchar(80) NOT NULL,
	"station_id" uuid NOT NULL,
	"ocpp_protocol" varchar(20) DEFAULT 'ocpp1.6' NOT NULL,
	"status" charger_status DEFAULT 'offline' NOT NULL,
	"last_heartbeat" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chargers_chargebox_id_unique" UNIQUE("chargebox_id")
);
--> statement-breakpoint
CREATE TABLE "charging_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connector_id" uuid NOT NULL,
	"driver_id" uuid,
	"ocpp_transaction_id" integer,
	"id_tag" varchar(80),
	"start_meter_wh" integer,
	"end_meter_wh" integer,
	"kwh" numeric(10, 3) DEFAULT '0',
	"paid_kwh" numeric(10, 3) NOT NULL,
	"status" "session_status" DEFAULT 'pending_start' NOT NULL,
	"stop_reason" varchar(60),
	"started_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"charger_id" uuid NOT NULL,
	"connector_no" integer NOT NULL,
	"name" varchar(120),
	"connector_type" varchar(40),
	"power_kw" numeric(6, 2),
	"voltage_v" numeric(6, 2),
	"price_group_id" uuid,
	"status" "connector_status" DEFAULT 'unavailable' NOT NULL,
	CONSTRAINT "uniq_charger_connector" UNIQUE("charger_id","connector_no")
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(200) NOT NULL,
	"phone" varchar(20),
	"name" varchar(160),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"connector_id" uuid NOT NULL,
	"driver_id" uuid,
	"provider" "payment_provider" DEFAULT 'razorpay' NOT NULL,
	"provider_ref" varchar(120),
	"base_amount" numeric(10, 2) NOT NULL,
	"gst_amount" numeric(10, 2) NOT NULL,
	"txn_fee" numeric(10, 2) NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"refund_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"status" "payment_status" DEFAULT 'created' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "payments_provider_ref_unique" UNIQUE("provider_ref")
);
--> statement-breakpoint
CREATE TABLE "price_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"gateway" "payment_provider" DEFAULT 'razorpay' NOT NULL,
	"price_per_kwh" numeric(10, 2) NOT NULL,
	"gst_pct" numeric(5, 2) DEFAULT '18.00' NOT NULL,
	"txn_pct" numeric(5, 2) DEFAULT '2.00' NOT NULL,
	"charges_bearer" charges_bearer DEFAULT 'customer' NOT NULL,
	"min_recharge" numeric(10, 2) DEFAULT '300.00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfid_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" varchar(80) NOT NULL,
	"driver_id" uuid,
	"blocked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rfid_tags_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"address" text,
	"lat" double precision,
	"lng" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"email" varchar(200) NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'operator' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "chargers" ADD CONSTRAINT "chargers_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charging_sessions" ADD CONSTRAINT "charging_sessions_connector_id_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charging_sessions" ADD CONSTRAINT "charging_sessions_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connectors" ADD CONSTRAINT "connectors_charger_id_chargers_id_fk" FOREIGN KEY ("charger_id") REFERENCES "public"."chargers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connectors" ADD CONSTRAINT "connectors_price_group_id_price_groups_id_fk" FOREIGN KEY ("price_group_id") REFERENCES "public"."price_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_session_id_charging_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."charging_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_connector_id_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_groups" ADD CONSTRAINT "price_groups_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfid_tags" ADD CONSTRAINT "rfid_tags_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
CREATE TABLE "login_cpo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(80) NOT NULL,
	"password_hash" text NOT NULL,
	"company_name" varchar(160) NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "login_cpo_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "login_cpo" ADD CONSTRAINT "login_cpo_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
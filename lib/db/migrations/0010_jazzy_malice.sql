CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"hostname" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"verification" jsonb,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "domains_hostname_unique" ON "domains" USING btree ("hostname");--> statement-breakpoint
CREATE INDEX "domains_account_idx" ON "domains" USING btree ("account_id");
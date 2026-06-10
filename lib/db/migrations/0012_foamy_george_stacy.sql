CREATE TABLE "account_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"day" date NOT NULL,
	"channel" text NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "status" text DEFAULT 'waitlisted' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_usage" ADD CONSTRAINT "account_usage_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_usage_account_day_channel_unique" ON "account_usage" USING btree ("account_id","day","channel");--> statement-breakpoint
CREATE INDEX "account_usage_account_day_idx" ON "account_usage" USING btree ("account_id","day");--> statement-breakpoint
-- Accounts created before the signup gate existed were implicitly approved;
-- only signups from here on start waitlisted.
UPDATE "accounts" SET "status" = 'active';

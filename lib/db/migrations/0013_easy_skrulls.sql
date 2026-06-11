CREATE TABLE "account_billing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"subscription_status" text,
	"current_period_end" timestamp with time zone,
	"last_nudge_month" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "plan" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_billing" ADD CONSTRAINT "account_billing_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_billing_account_unique" ON "account_billing" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_billing_customer_unique" ON "account_billing" USING btree ("stripe_customer_id") WHERE stripe_customer_id IS NOT NULL;
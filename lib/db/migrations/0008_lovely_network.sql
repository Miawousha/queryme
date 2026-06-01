CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_id" text,
	"username" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "persona_source" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persona_source" ADD CONSTRAINT "persona_source_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_account_last_msg_idx" ON "conversations" USING btree ("account_id","last_message_at" DESC);--> statement-breakpoint
CREATE INDEX "persona_source_account_synced_at_idx" ON "persona_source" USING btree ("account_id","synced_at" DESC);
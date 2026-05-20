CREATE TABLE "askers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"company" text NOT NULL,
	"work_email" text NOT NULL,
	"role" text NOT NULL,
	"purpose" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "askers_work_email_unique" UNIQUE("work_email")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asker_id" uuid,
	"channel" text NOT NULL,
	"language" text,
	"transcript" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sensitive_unlocked_at" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions_for_alex" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid,
	"asker_id" uuid,
	"question" text NOT NULL,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_asker_id_askers_id_fk" FOREIGN KEY ("asker_id") REFERENCES "public"."askers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions_for_alex" ADD CONSTRAINT "questions_for_alex_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions_for_alex" ADD CONSTRAINT "questions_for_alex_asker_id_askers_id_fk" FOREIGN KEY ("asker_id") REFERENCES "public"."askers"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "askers" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "askers" CASCADE;--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_asker_id_askers_id_fk";
--> statement-breakpoint
ALTER TABLE "questions_for_alex" DROP CONSTRAINT "questions_for_alex_asker_id_askers_id_fk";
--> statement-breakpoint
ALTER TABLE "conversations" DROP COLUMN "asker_id";--> statement-breakpoint
ALTER TABLE "conversations" DROP COLUMN "sensitive_unlocked_at";--> statement-breakpoint
ALTER TABLE "questions_for_alex" DROP COLUMN "asker_id";
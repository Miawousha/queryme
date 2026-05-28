ALTER TABLE "questions_for_alex" RENAME TO "forwarded_questions";--> statement-breakpoint

ALTER TABLE "forwarded_questions"
  RENAME CONSTRAINT "questions_for_alex_conversation_id_conversations_id_fk"
  TO "forwarded_questions_conversation_id_conversations_id_fk";

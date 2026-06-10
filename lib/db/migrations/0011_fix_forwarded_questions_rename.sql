-- Corrective, idempotent rename for migration 0007.
--
-- 0007 (questions_for_alex -> forwarded_questions) was committed with a
-- backdated journal timestamp, so Drizzle silently SKIPPED it on every DB that
-- had already applied a later migration. Those DBs still have the old table
-- name while the app queries `forwarded_questions`. Re-running 0007 is
-- impossible (its folderMillis is below the applied baseline), so this
-- migration performs the rename guarded by existence checks:
--   * affected DB (old name present, new absent) -> rename happens
--   * healthy DB (already renamed)               -> no-op
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'questions_for_alex'
  ) AND NOT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'forwarded_questions'
  ) THEN
    ALTER TABLE "questions_for_alex" RENAME TO "forwarded_questions";
    ALTER TABLE "forwarded_questions"
      RENAME CONSTRAINT "questions_for_alex_conversation_id_conversations_id_fk"
      TO "forwarded_questions_conversation_id_conversations_id_fk";
  END IF;
END $$;

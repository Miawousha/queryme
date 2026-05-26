import { z } from "zod";

export const EvalQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  language: z.enum(["en", "fr"]).default("en"),
  mustCite: z.array(z.string()).default([]),
  mustContain: z.array(z.string()).default([]),
  mustNotContain: z.array(z.string()).default([]),
  notes: z.string().optional(),
});
export type EvalQuestion = z.infer<typeof EvalQuestionSchema>;

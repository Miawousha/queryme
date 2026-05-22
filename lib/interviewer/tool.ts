import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { InterviewerIdentity } from "@/lib/db/schema";

/** Input the agent supplies — identity fields minus the server-stamped time. */
const IdentifyInputSchema = z.object({
  name: z.string().optional(),
  company: z.string().optional(),
  role: z.string().optional(),
  hiringFor: z.string().optional(),
  contact: z.string().optional(),
  notes: z.string().optional(),
  basis: z.enum(["stated", "inferred"]),
});

/**
 * Build the `identify_interviewer` tool set, bound to a `persist` closure that
 * writes the identity for one specific conversation. Returned as a `ToolSet`
 * record so callers can spread it straight into `answer({ tools })`.
 *
 * `execute` never throws: a persistence failure is best-effort and must not
 * abort the answer stream — it is reported back to the model as `ok: false`.
 */
export function buildIdentifyTools(
  persist: (identity: InterviewerIdentity) => Promise<void>,
): ToolSet {
  return {
    identify_interviewer: tool({
      description:
        "Record who you are talking to. Call this when the visitor reveals " +
        "their identity (name, company, their role, what they are hiring " +
        "for, contact details). Pass the COMPLETE picture you have so far " +
        "every time — this overwrites the previous record. Set `basis` to " +
        "`stated` when the visitor said it explicitly, `inferred` when you " +
        "deduced it from context.",
      inputSchema: IdentifyInputSchema,
      execute: async (rawInput) => {
        // The AI SDK validates `inputSchema` against model tool-calls in its
        // generation loop, but `execute` is also reachable directly (and tests
        // call it directly). Re-parse here so invalid input is rejected rather
        // than silently persisted — this throw is an input-contract violation,
        // distinct from the best-effort persistence path below.
        const input = IdentifyInputSchema.parse(rawInput);
        const identity: InterviewerIdentity = {
          ...input,
          updatedAt: new Date().toISOString(),
        };
        try {
          await persist(identity);
          return { ok: true as const };
        } catch (err) {
          return {
            ok: false as const,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    }),
  };
}

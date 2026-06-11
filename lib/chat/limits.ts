/**
 * Shared turn-limit constants for the chat POST and history GET handlers.
 *
 * Kept in a dependency-free leaf module so the history route can import its
 * cap without dragging in the chat handler's module graph (answerer, AI SDK,
 * kv, zod).
 */

/** Max messages per chat POST. Shared so the history endpoint's cap can be
 * derived from it (the seeded history is echoed back through this limit). */
export const MAX_TURNS = 50;

/**
 * Max transcript turns the history endpoint returns (the most recent win).
 *
 * The cap is derived from — and must stay BELOW — the chat POST's MAX_TURNS:
 * the client seeds these turns into `useChat`, and every continuation echoes
 * the whole thread back through `/api/chat`, which rejects > MAX_TURNS
 * messages. Returning MAX_TURNS or more would render a thread whose very next
 * message 400s. MAX_TURNS − 10 restores any realistic conversation in full
 * while leaving ten message slots of headroom before that (pre-existing)
 * ceiling is reached.
 */
export const HISTORY_TURNS_CAP = MAX_TURNS - 10;

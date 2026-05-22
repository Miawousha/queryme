/**
 * The public GitHub repository this app is built from. Used to link to the
 * system prompt, the knowledge base, and individual KB files. Overridable per
 * deployment via the `NEXT_PUBLIC_REPO_*` env vars.
 */
export const REPO_URL =
  process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/Miawousha/queryme";

export const REPO_BRANCH = process.env.NEXT_PUBLIC_REPO_BRANCH ?? "main";

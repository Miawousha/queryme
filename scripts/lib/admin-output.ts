export type OutputMode = "json" | "pretty";

/** Explicit flag wins; otherwise pretty for a TTY, json when piped/redirected. */
export function resolveOutputMode(flag: OutputMode | undefined, isTTY: boolean): OutputMode {
  if (flag) return flag;
  return isTTY ? "pretty" : "json";
}

export function renderSuccess(
  command: string,
  result: unknown,
  pretty: string,
  mode: OutputMode,
): string {
  if (mode === "json") {
    return JSON.stringify({ ok: true, command, result }, null, 2);
  }
  return pretty;
}

export function renderError(
  command: string,
  error: string,
  hint: string | undefined,
  mode: OutputMode,
): string {
  if (mode === "json") {
    const envelope: { ok: false; command: string; error: string; hint?: string } = {
      ok: false,
      command,
      error,
    };
    if (hint) envelope.hint = hint;
    return JSON.stringify(envelope, null, 2);
  }
  return hint ? `Error: ${error}\nHint: ${hint}` : `Error: ${error}`;
}

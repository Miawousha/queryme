/**
 * Error type for expected CLI failures. `hint` is an actionable next step
 * surfaced to the operator (and into the JSON error envelope). Throwing a
 * plain Error instead signals an unexpected failure.
 */
export class CliError extends Error {
  hint?: string;
  constructor(message: string, hint?: string) {
    super(message);
    this.name = "CliError";
    this.hint = hint;
  }
}

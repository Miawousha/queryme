import { parseArgs } from "node:util";
import type { OutputMode } from "./admin-output";

export type ParsedCommand =
  | {
      command: "sync";
      repoUrl?: string;
      branch?: string;
      remote?: string;
      remotePassword?: string;
      dryRun: boolean;
      interactive: boolean;
      verbose: boolean;
      outputFlag?: OutputMode;
    }
  | { command: "status"; remote?: string; remotePassword?: string; interactive: boolean; outputFlag?: OutputMode }
  | { command: "migrate"; dryRun: boolean; outputFlag?: OutputMode }
  | { command: "help"; outputFlag?: OutputMode };

export type ParseResult =
  | { kind: "ok"; parsed: ParsedCommand }
  | { kind: "usage-error"; message: string };

const OPTIONS = {
  branch: { type: "string" },
  remote: { type: "string" },
  "remote-password": { type: "string" },
  "dry-run": { type: "boolean", default: false },
  json: { type: "boolean", default: false },
  pretty: { type: "boolean", default: false },
  interactive: { type: "boolean", default: false },
  verbose: { type: "boolean", default: false },
} as const;

function usage(message: string): ParseResult {
  return { kind: "usage-error", message };
}

export function parseAdminArgs(argv: string[]): ParseResult {
  let values: Record<string, string | boolean | undefined>;
  let positionals: string[];
  try {
    const parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
    values = parsed.values;
    positionals = parsed.positionals;
  } catch (err) {
    return usage(err instanceof Error ? err.message : String(err));
  }

  if (values.json && values.pretty) {
    return usage("--json and --pretty are mutually exclusive");
  }
  const outputFlag: OutputMode | undefined = values.json
    ? "json"
    : values.pretty
      ? "pretty"
      : undefined;

  const command = positionals[0] ?? "help";
  const rest = positionals.slice(1);

  switch (command) {
    case "help":
      if (rest.length) return usage(`unexpected argument: ${rest[0]}`);
      return { kind: "ok", parsed: { command: "help", outputFlag } };

    case "status":
      if (rest.length) return usage(`unexpected argument: ${rest[0]}`);
      return {
        kind: "ok",
        parsed: {
          command: "status",
          remote: values.remote as string | undefined,
          remotePassword: values["remote-password"] as string | undefined,
          interactive: Boolean(values.interactive),
          outputFlag,
        },
      };

    case "migrate":
      if (rest.length) return usage(`unexpected argument: ${rest[0]}`);
      if (values.remote) {
        return usage(
          "migrate targets the database directly — set POSTGRES_URL to the target database (not --remote)",
        );
      }
      return {
        kind: "ok",
        parsed: { command: "migrate", dryRun: Boolean(values["dry-run"]), outputFlag },
      };

    case "sync":
      if (rest.length > 1) return usage(`unexpected argument: ${rest[1]}`);
      return {
        kind: "ok",
        parsed: {
          command: "sync",
          repoUrl: rest[0],
          branch: values.branch as string | undefined,
          remote: values.remote as string | undefined,
          remotePassword: values["remote-password"] as string | undefined,
          dryRun: Boolean(values["dry-run"]),
          interactive: Boolean(values.interactive),
          verbose: Boolean(values.verbose),
          outputFlag,
        },
      };

    default:
      return usage(`unknown command: ${command}`);
  }
}

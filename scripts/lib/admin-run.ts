import { parseAdminArgs, type ParsedCommand } from "./admin-args";
import { resolveOutputMode, renderSuccess, renderError } from "./admin-output";
import { CliError } from "./admin-errors";
import { login, fetchStatus, postSync, type StatusResponse } from "./admin-remote";
import {
  getActivePersonaSourceRowForAccount,
  listSyncHistoryForAccount,
  syncFromGitHubForAccount,
  resolveLatestSha,
} from "@/lib/persona-source";
import { runMigrations, listPendingMigrations } from "@/lib/db/migrate";
import { getDb } from "@/lib/db/client";
import { createAccount, getAccountBySlug, getRootAccountId } from "@/lib/accounts/repo";

export type RunContext = { env: Record<string, string | undefined>; isTTY: boolean };
type HandlerOutput = { result: unknown; pretty: string };

export const MANIFEST = {
  name: "admin",
  commands: [
    {
      name: "sync",
      summary: "Sync persona content from GitHub (local cache+DB, or --remote instance).",
      usage: "admin sync [repoUrl] [--branch <name>] [--remote <url>] [--dry-run] [--json|--pretty]",
      flags: ["--branch", "--remote", "--remote-password", "--dry-run", "--json", "--pretty", "--interactive", "--verbose"],
    },
    {
      name: "account",
      summary: "Manage accounts: create one, or link its persona content repo.",
      usage: "admin account create <username> | admin account link <username> <repoUrl> [--branch <name>] [--json|--pretty]",
      flags: ["--branch", "--json", "--pretty"],
    },
    {
      name: "status",
      summary: "Show the active persona source and recent sync history.",
      usage: "admin status [--remote <url>] [--json|--pretty]",
      flags: ["--remote", "--remote-password", "--json", "--pretty", "--interactive"],
    },
    {
      name: "migrate",
      summary: "Run DB migrations against POSTGRES_URL (always direct-DB; --remote is rejected).",
      usage: "admin migrate [--dry-run] [--json|--pretty]",
      flags: ["--dry-run", "--json", "--pretty"],
    },
    {
      name: "help",
      summary: "Show this manifest.",
      usage: "admin help [--json]",
      flags: ["--json"],
    },
  ],
  exitCodes: [
    { code: 0, meaning: "success" },
    { code: 1, meaning: "operation error" },
    { code: 2, meaning: "usage error" },
  ],
  notes: [
    "Output defaults to JSON when stdout is not a TTY, pretty when it is.",
    "A local sync updates the local cache + DB row only; use --remote to refresh a running deployed instance.",
  ],
} as const;

function requirePassword(
  cmd: { remote?: string; remotePassword?: string },
  ctx: RunContext,
): string {
  const pw = cmd.remotePassword ?? ctx.env.ADMIN_PASSWORD;
  if (!pw) {
    throw new CliError(
      "admin password required for --remote",
      "set ADMIN_PASSWORD or pass --remote-password",
    );
  }
  return pw;
}

function prettyStatus(s: StatusResponse, mode: string): string {
  const a = s.active;
  const head = a
    ? `active: ${a.repoUrl}@${a.branch} ${a.commitSha.slice(0, 8)} (${a.status}, synced ${String(a.syncedAt)})`
    : "active: none";
  const lines = s.history.map(
    (h) => `  ${String(h.syncedAt)}  ${h.status}  ${h.commitSha.slice(0, 8)}  ${h.error ?? ""}`.trimEnd(),
  );
  return [`[${mode}] ${head}`, "history:", ...lines].join("\n");
}

function prettySync(changed: boolean, sha: string, prev: string | null, dryRun: boolean): string {
  const verb = dryRun ? "would sync" : "synced";
  if (!changed) return `${verb}: no change (already at ${sha.slice(0, 8)})`;
  return `${verb}: ${prev ? prev.slice(0, 8) : "none"} -> ${sha.slice(0, 8)}`;
}

async function handleStatus(
  cmd: Extract<ParsedCommand, { command: "status" }>,
  ctx: RunContext,
): Promise<HandlerOutput> {
  if (cmd.remote) {
    const cookie = await login(cmd.remote, requirePassword(cmd, ctx));
    const s = await fetchStatus(cmd.remote, cookie);
    return { result: { mode: "remote", ...s }, pretty: prettyStatus(s, "remote") };
  }
  const accountId = await getRootAccountId(getDb());
  const [active, history] = await Promise.all([
    getActivePersonaSourceRowForAccount(accountId),
    listSyncHistoryForAccount(accountId, 10),
  ]);
  const s: StatusResponse = { active, history };
  return { result: { mode: "local", ...s }, pretty: prettyStatus(s, "local") };
}

async function handleSync(
  cmd: Extract<ParsedCommand, { command: "sync" }>,
  ctx: RunContext,
): Promise<HandlerOutput> {
  const mode = cmd.remote ? "remote" : "local";

  let previousSha: string | null;
  let defaultRepoUrl: string | undefined;
  let defaultBranch: string | undefined;
  let cookie: string | undefined;

  if (cmd.remote) {
    cookie = await login(cmd.remote, requirePassword(cmd, ctx));
    const s = await fetchStatus(cmd.remote, cookie);
    previousSha = s.active?.commitSha ?? null;
    defaultRepoUrl = s.active?.repoUrl;
    defaultBranch = s.active?.branch;
  } else {
    const accountId = await getRootAccountId(getDb());
    const active = await getActivePersonaSourceRowForAccount(accountId);
    previousSha = active?.commitSha ?? null;
    defaultRepoUrl = active?.repoUrl;
    defaultBranch = active?.branch;
  }

  const repoUrl = cmd.repoUrl ?? defaultRepoUrl;
  if (!repoUrl) {
    throw new CliError(
      "no repoUrl given and no active persona source to default from",
      "pass a repoUrl, e.g. `admin sync https://github.com/owner/repo`",
    );
  }
  const branch = cmd.branch ?? defaultBranch ?? "main";

  if (cmd.dryRun) {
    const latest = await resolveLatestSha(repoUrl, branch);
    const changed = latest !== previousSha;
    return {
      result: { mode, dryRun: true, changed, commitSha: latest, previousSha, repoUrl, branch },
      pretty: prettySync(changed, latest, previousSha, true),
    };
  }

  if (cmd.remote) {
    const res = await postSync(cmd.remote, cookie!, { repoUrl, branch });
    const changed = res.commitSha !== previousSha;
    return {
      result: { mode, dryRun: false, changed, commitSha: res.commitSha, previousSha, syncedAt: res.syncedAt, repoUrl, branch },
      pretty: prettySync(changed, res.commitSha, previousSha, false),
    };
  }

  const localAccountId = await getRootAccountId(getDb());
  const res = await syncFromGitHubForAccount(localAccountId, repoUrl, branch);
  if (res.kind === "error") {
    throw new CliError(
      res.message,
      "check the repo URL, branch, and that required persona files exist",
    );
  }
  const changed = res.commitSha !== previousSha;
  return {
    // Normalize to ISO so the envelope's `syncedAt` is a string in both local
    // and remote modes (syncFromGitHubForAccount returns a Date; postSync a string).
    result: { mode, dryRun: false, changed, commitSha: res.commitSha, previousSha, syncedAt: res.syncedAt.toISOString(), repoUrl, branch },
    pretty: prettySync(changed, res.commitSha, previousSha, false),
  };
}

async function handleMigrate(
  cmd: Extract<ParsedCommand, { command: "migrate" }>,
  ctx: RunContext,
): Promise<HandlerOutput> {
  const url = ctx.env.POSTGRES_URL;
  if (!url) {
    throw new CliError(
      "POSTGRES_URL is not set",
      "set POSTGRES_URL to the target database",
    );
  }
  if (cmd.dryRun) {
    const pending = await listPendingMigrations(url);
    return {
      result: { dryRun: true, count: pending.length, pending },
      pretty: pending.length
        ? `pending migrations (${pending.length}):\n${pending.map((t) => `  ${t}`).join("\n")}`
        : "no pending migrations",
    };
  }
  await runMigrations(url);
  return { result: { dryRun: false, applied: true }, pretty: "migrations applied" };
}

function handleHelp(): HandlerOutput {
  const pretty = [
    `${MANIFEST.name} — queryme admin CLI`,
    "",
    ...MANIFEST.commands.map((c) => `  ${c.usage}\n      ${c.summary}`),
    "",
    "exit codes: " + MANIFEST.exitCodes.map((e) => `${e.code}=${e.meaning}`).join(", "),
  ].join("\n");
  return { result: MANIFEST, pretty };
}

async function handleAccount(
  cmd: Extract<ParsedCommand, { command: "account" }>,
): Promise<HandlerOutput> {
  const db = getDb();
  if (cmd.sub === "create") {
    const acct = await createAccount(db, { username: cmd.username });
    return {
      result: { ok: true, account: acct },
      pretty: `created account ${acct.username} (${acct.id})`,
    };
  }
  // link
  const acct = await getAccountBySlug(db, cmd.username);
  if (!acct) {
    throw new CliError(
      `no account '${cmd.username}'`,
      "create it first: admin account create <username>",
    );
  }
  const res = await syncFromGitHubForAccount(acct.id, cmd.repoUrl!, cmd.branch ?? "main");
  if (res.kind === "error") {
    throw new CliError(
      res.message,
      "check the repo URL, branch, and that required persona files exist",
    );
  }
  return {
    result: {
      ok: true,
      account: acct.username,
      commitSha: res.commitSha,
      syncedAt: res.syncedAt.toISOString(),
    },
    pretty: `linked ${cmd.username} -> ${cmd.repoUrl} @ ${res.commitSha.slice(0, 8)}`,
  };
}

async function dispatch(cmd: ParsedCommand, ctx: RunContext): Promise<HandlerOutput> {
  switch (cmd.command) {
    case "help":
      return handleHelp();
    case "status":
      return handleStatus(cmd, ctx);
    case "sync":
      return handleSync(cmd, ctx);
    case "migrate":
      return handleMigrate(cmd, ctx);
    case "account":
      return handleAccount(cmd);
  }
}

function errInfo(err: unknown, verbose: boolean): { message: string; hint?: string } {
  // Expected failures (CliError) carry their own actionable message + hint.
  // For unexpected errors, --verbose surfaces the full stack for diagnosis.
  if (err instanceof CliError) return { message: err.message, hint: err.hint };
  if (err instanceof Error) {
    return { message: verbose && err.stack ? err.stack : err.message };
  }
  return { message: String(err) };
}

export async function run(
  argv: string[],
  ctx: RunContext,
): Promise<{ exitCode: number; stdout: string }> {
  const parse = parseAdminArgs(argv);
  if (parse.kind === "usage-error") {
    const mode = resolveOutputMode(undefined, ctx.isTTY);
    return {
      exitCode: 2,
      stdout: renderError("?", parse.message, "run `admin help` for usage", mode),
    };
  }

  const cmd = parse.parsed;
  const mode = resolveOutputMode(cmd.outputFlag, ctx.isTTY);
  try {
    const out = await dispatch(cmd, ctx);
    return { exitCode: 0, stdout: renderSuccess(cmd.command, out.result, out.pretty, mode) };
  } catch (err) {
    const verbose = cmd.command === "sync" ? cmd.verbose : false;
    const { message, hint } = errInfo(err, verbose);
    return { exitCode: 1, stdout: renderError(cmd.command, message, hint, mode) };
  }
}

/**
 * The prompt a user pastes into their coding agent. It carries a short-lived
 * scoped token so the agent can register the repo itself; the only remaining
 * human step is the one-time GitHub App install for ongoing push-sync.
 */
export function buildAgentPrompt(args: {
  origin: string;
  username: string;
  token: string;
  appInstallUrl: string | null;
}): string {
  const { origin, username, token, appInstallUrl } = args;
  const registerUrl = `${origin}/api/a/${username}/admin/persona-source`;
  const lines = [
    `I'm setting up my Queritae knowledge base — a queryable CV that will live at ${origin}/${username}.`,
    "",
    `1. Fetch ${origin}/setup-guide.md and follow it exactly. Ask me for my source material (CV, LinkedIn export, portfolio links) and interview me briefly to fill gaps and capture stories.`,
    `2. When everything passes the guide's self-checks, create a PUBLIC GitHub repo and push.`,
    `3. Register the repo with Queritae (this credential expires in 60 minutes — if it lapses, ask me for a fresh prompt):`,
    "",
    `   curl -X POST ${registerUrl} \\`,
    `     -H "Authorization: Bearer ${token}" \\`,
    `     -H "Content-Type: application/json" \\`,
    `     -d '{"repoUrl":"https://github.com/<owner>/<repo>"}'`,
    "",
    `   A 200 with a commitSha means my page is live. If it returns an error, fix the reported file, push, and retry the same curl.`,
  ];
  if (appInstallUrl) {
    lines.push(
      "",
      `4. Finally, tell me to install the GitHub App at ${appInstallUrl} — one click turns on auto-sync so every future push updates my page.`,
    );
  }
  return lines.join("\n");
}

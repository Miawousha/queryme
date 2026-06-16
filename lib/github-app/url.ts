/** The GitHub App install URL, or null when the app slug env is unset. */
export function appInstallUrl(): string | null {
  const slug = process.env.GITHUB_APP_SLUG;
  return slug ? `https://github.com/apps/${slug}/installations/new` : null;
}

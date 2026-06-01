/** The GitHub login is a reserved slug, so no account can be auto-provisioned. */
export class ReservedLoginError extends Error {
  constructor(login: string) {
    super(`'${login}' is a reserved name and cannot be used as an account`);
    this.name = "ReservedLoginError";
  }
}

/** The slug already belongs to a different GitHub identity (slug is immutable in v1). */
export class SlugConflictError extends Error {
  constructor(login: string) {
    super(`username '${login}' is already claimed by another GitHub identity`);
    this.name = "SlugConflictError";
  }
}

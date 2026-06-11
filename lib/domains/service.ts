import type { getDb } from "@/lib/db/client";
import type { Account, Domain } from "@/lib/db/schema";
import { normalizeHostname, validateHostname } from "@/lib/domains/validate";
import { computeStatus } from "@/lib/domains/status";
import { vercelDomains, VercelApiError } from "@/lib/domains/vercel";
import * as repo from "@/lib/domains/repo";
import { setDomainSlug, delDomainSlug } from "@/lib/domains/edge-cache";

type Db = ReturnType<typeof getDb>;

export const MAX_DOMAINS_PER_ACCOUNT = 3;
const CNAME_TARGET = "cname.vercel-dns.com";

/** `reason` is a machine code; `message` is human-facing. */
export class DomainError extends Error {
  constructor(
    public reason: "invalid" | "limit" | "taken" | "not-found" | "pro_required",
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export type DomainInstructions = { type: "CNAME"; name: string; value: string };
export type DomainView = Domain & { instructions: DomainInstructions };

/** The CNAME record the user must create: name = the sub-label(s), value = target. */
function instructionsFor(hostname: string): DomainInstructions {
  const name = hostname.split(".").slice(0, -2).join(".") || hostname;
  return { type: "CNAME", name, value: CNAME_TARGET };
}

export function toView(d: Domain): DomainView {
  return { ...d, instructions: instructionsFor(d.hostname) };
}

export async function addDomainForAccount(
  db: Db,
  account: Account,
  raw: string,
): Promise<DomainView> {
  // Adding domains is Pro-only. Existing active domains keep serving — the
  // gate is on creation, never on traffic, so a downgrade can't break a live URL.
  if (account.plan !== "pro") {
    throw new DomainError("pro_required", "Custom domains require the Pro plan.");
  }

  const hostname = normalizeHostname(raw);
  const check = validateHostname(hostname, process.env.PLATFORM_HOST ?? null);
  if (!check.ok) throw new DomainError("invalid", check.reason);

  if ((await repo.countDomainsByAccount(db, account.id)) >= MAX_DOMAINS_PER_ACCOUNT) {
    throw new DomainError("limit", `You can add up to ${MAX_DOMAINS_PER_ACCOUNT} domains.`);
  }
  if (await repo.getDomainByHostname(db, hostname)) {
    throw new DomainError("taken", "That domain is already in use.");
  }

  let verification: Domain["verification"] = null;
  try {
    const added = await vercelDomains.add(hostname);
    verification = added.verification ?? null;
  } catch (e) {
    if (e instanceof VercelApiError && e.code === "domain_already_in_use") {
      throw new DomainError("taken", "That domain is already in use.");
    }
    throw e;
  }

  const row = await repo.insertDomain(db, {
    accountId: account.id,
    hostname,
    status: "pending",
    verification,
  });
  return toView(row);
}

export async function refreshStatus(db: Db, domain: Domain, slug: string): Promise<DomainView> {
  try {
    const [pd, conf] = await Promise.all([
      vercelDomains.get(domain.hostname),
      vercelDomains.config(domain.hostname),
    ]);
    const status = computeStatus({ verified: pd.verified, misconfigured: conf.misconfigured });
    const updated =
      (await repo.updateDomain(db, domain.id, {
        status,
        verification: pd.verification ?? null,
        lastError: null,
        lastCheckedAt: new Date(),
        verifiedAt: status === "active" ? (domain.verifiedAt ?? new Date()) : null,
      })) ?? domain;

    if (status === "active") await setDomainSlug(domain.hostname, slug);
    else await delDomainSlug(domain.hostname);

    return toView(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    try {
      const updated =
        (await repo.updateDomain(db, domain.id, {
          status: "error",
          lastError: message,
          lastCheckedAt: new Date(),
        })) ?? domain;
      return toView(updated);
    } catch {
      // Double fault (Vercel error + DB write failure): best-effort, never throw.
      return toView(domain);
    }
  }
}

export async function removeDomainForAccount(
  db: Db,
  account: Account,
  domainId: string,
): Promise<void> {
  const row = await repo.getDomainById(db, domainId);
  if (!row || row.accountId !== account.id) {
    throw new DomainError("not-found", "Domain not found.");
  }
  try {
    await vercelDomains.remove(row.hostname);
  } catch (e) {
    // Tolerate "already removed on Vercel" — still clean up our side.
    if (!(e instanceof VercelApiError)) throw e;
  }
  await repo.deleteDomain(db, row.id);
  await delDomainSlug(row.hostname);
}

export async function listDomainsForAccount(db: Db, accountId: string): Promise<DomainView[]> {
  const rows = await repo.listDomainsByAccount(db, accountId);
  return rows.map(toView);
}

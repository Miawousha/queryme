import type { Domain } from "@/lib/db/schema";

/**
 * Maps Vercel's verified/misconfigured flags to our stored status. `"error"`
 * is never returned here — the service assigns it when a Vercel API call throws.
 */
export function computeStatus(input: {
  verified: boolean;
  misconfigured: boolean;
}): Domain["status"] {
  return input.verified && !input.misconfigured ? "active" : "pending";
}

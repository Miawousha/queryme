import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Resolves `candidate` with symlinks followed (`realpath`) and verifies the
 * result stays strictly inside `dir`. Returns the real path on success; throws
 * otherwise. Final-layer defense for the KB-file route against any symlink that
 * escapes the KB directory (the tar filter and manifest walk are the earlier
 * layers).
 */
export async function realpathWithin(dir: string, candidate: string): Promise<string> {
  const realDir = await fs.realpath(dir);
  const realCandidate = await fs.realpath(candidate);
  const rel = path.relative(realDir, realCandidate);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("resolved path escapes the base directory");
  }
  return realCandidate;
}

import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { EvalQuestionSchema, type EvalQuestion } from "./schema";

export async function loadEvals(dir: string): Promise<EvalQuestion[]> {
  const files = (await fs.readdir(dir))
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort();
  const out: EvalQuestion[] = [];
  for (const f of files) {
    const raw = await fs.readFile(path.join(dir, f), "utf8");
    out.push(EvalQuestionSchema.parse(parseYaml(raw)));
  }
  return out;
}

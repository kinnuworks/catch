// Builds the labeling pool: the top candidate sentences from each real terms document.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { findCandidates } from "../src/core/lexicon";
import { splitSentences } from "../src/core/sentences";

const PER_DOC = 8;
const items: { key: string; service: string; url: string; text: string; ruleKinds: string[] }[] = [];
for (const f of readdirSync("eval/cache").filter((f) => f.endsWith(".txt")).sort()) {
  const [service, url, , ...rest] = readFileSync(`eval/cache/${f}`, "utf8").split("\n");
  const cands = findCandidates(splitSentences(rest.join("\n")), { limit: PER_DOC });
  cands.forEach((c, i) => items.push({ key: `${f.replace(".txt", "")}#${i + 1}`, service: service!, url: url!, text: c.sentence.text, ruleKinds: c.kinds }));
}
// The pool is frozen once labelling starts; pass --force to rebuild it.
if (existsSync("eval/pool.json") && !process.argv.includes("--force")) throw new Error("eval/pool.json exists and may already be labelled; use --force");
writeFileSync("eval/pool.json", JSON.stringify(items, null, 1));
console.log(items.length, "sentences from", new Set(items.map((i) => i.service)).size, "services");

// Scores each reader against the hand labels. Usage: tsx eval/score.ts path/to/catch-labels.json
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { plainIsGrounded } from "../src/core/analyze";
import { TRAP_KINDS } from "../src/core/types";

const labelsFile = process.argv[2] ?? `${process.env.HOME}/Downloads/catch-labels.json`;
if (!existsSync(labelsFile)) throw new Error(`no labels at ${labelsFile}`);
const gold = JSON.parse(readFileSync(labelsFile, "utf8")) as Record<string, string[]>;
const pool = JSON.parse(readFileSync("eval/pool.json", "utf8")) as { key: string; text: string; service: string }[];
const keys = pool.map((p) => p.key).filter((k) => (gold[k] ?? []).length > 0);
const text = new Map(pool.map((p) => [p.key, p.text]));

const pct = (n: number) => `${(100 * n).toFixed(0)}%`;
const lines: string[] = [`Hand-labelled sentences: ${keys.length} from ${new Set(keys.map((k) => k.split("#")[0])).size} services`, ""];
const summary: Record<string, unknown> = { labelled: keys.length };

for (const file of readdirSync("eval").filter((f) => f.startsWith("pred-") && f.endsWith(".json")).sort()) {
  const pred = JSON.parse(readFileSync(`eval/${file}`, "utf8")) as { reader: string; msPerDoc: number; predictions: Record<string, { kinds: string[]; plain: string[] }> };
  let tp = 0, fp = 0, fn = 0, trapRight = 0, grounded = 0, plains = 0;
  const perKind: Record<string, { tp: number; fp: number; fn: number }> = {};
  for (const k of TRAP_KINDS) perKind[k] = { tp: 0, fp: 0, fn: 0 };
  for (const key of keys) {
    const g = new Set((gold[key] ?? []).filter((x) => x !== "none"));
    const p = new Set(pred.predictions[key]?.kinds ?? []);
    for (const k of TRAP_KINDS) {
      if (g.has(k) && p.has(k)) { tp++; perKind[k]!.tp++; }
      else if (!g.has(k) && p.has(k)) { fp++; perKind[k]!.fp++; }
      else if (g.has(k) && !p.has(k)) { fn++; perKind[k]!.fn++; }
    }
    if ((g.size > 0) === (p.size > 0)) trapRight++;
    for (const line of pred.predictions[key]?.plain ?? []) {
      if (!line) continue;
      plains++;
      if (plainIsGrounded(line, text.get(key)!)) grounded++;
    }
  }
  const precision = tp / Math.max(1, tp + fp), recall = tp / Math.max(1, tp + fn);
  const f1 = (2 * precision * recall) / Math.max(1e-9, precision + recall);
  lines.push(`## ${pred.reader}`, `kind labels: precision ${pct(precision)}, recall ${pct(recall)}, F1 ${pct(f1)}`, `trap vs no trap: ${pct(trapRight / keys.length)} correct`, `time per document: ${(pred.msPerDoc / 1000).toFixed(2)} s`);
  if (plains) lines.push(`plain-English lines whose numbers all appear in the source: ${grounded}/${plains}`);
  for (const k of TRAP_KINDS) {
    const c = perKind[k]!;
    lines.push(`  ${k.padEnd(15)} P ${pct(c.tp / Math.max(1, c.tp + c.fp)).padStart(4)}  R ${pct(c.tp / Math.max(1, c.tp + c.fn)).padStart(4)}  (gold ${c.tp + c.fn})`);
  }
  lines.push("");
  summary[pred.reader] = { precision, recall, f1, trapAccuracy: trapRight / keys.length, perKind, grounded, plains, msPerDoc: pred.msPerDoc };
}
writeFileSync("eval/results.md", lines.join("\n"));
writeFileSync("eval/results.json", JSON.stringify(summary, null, 1));
console.log(lines.join("\n"));

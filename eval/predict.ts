// Runs each reader over the labeling pool and stores what it said, so scoring needs no model.
// Usage: tsx eval/predict.ts rules | gemma3:1b | gemma4:e2b
import { readFileSync, writeFileSync } from "node:fs";
import { extractFacts } from "../src/core/facts";
import type { Candidate, ModelLabel, TrapKind } from "../src/core/types";
import { OllamaGemma } from "../src/model/gemma";

const reader = process.argv[2] ?? "rules";
const pool = JSON.parse(readFileSync("eval/pool.json", "utf8")) as { key: string; service: string; text: string; ruleKinds: TrapKind[] }[];

const byDoc = new Map<string, typeof pool>();
for (const item of pool) {
  const doc = item.key.split("#")[0]!;
  byDoc.set(doc, [...(byDoc.get(doc) ?? []), item]);
}

const out: Record<string, { kinds: string[]; plain: string[]; scores?: Record<string, number> }> = {};
const timings: number[] = [];
const raws: Record<string, string> = {};
for (const [doc, items] of byDoc) {
  const candidates: Candidate[] = items.map((it, i) => ({
    id: i + 1,
    sentence: { index: i, text: it.text, start: 0, end: it.text.length },
    kinds: it.ruleKinds,
    score: 3,
    facts: extractFacts(it.text),
  }));
  const t0 = performance.now();
  let labels: ModelLabel[];
  if (reader === "rules") {
    // Rules alone: every kind the rules suspected, so the comparison with the verifier is like for like.
    labels = candidates.flatMap((c) => c.kinds.map((kind) => ({ id: c.id, kind, plain: "" })));
  } else {
    labels = await new OllamaGemma(reader).classify(candidates);
  }
  timings.push(performance.now() - t0);
  items.forEach((it, i) => {
    const mine = labels.filter((l) => l.id === i + 1);
    const kept = mine.filter((l) => l.keep !== false);
    out[it.key] = { kinds: kept.map((l) => l.kind), plain: kept.map((l) => l.plain) };
    if (mine.some((l) => l.score !== undefined)) out[it.key]!.scores = Object.fromEntries(mine.map((l) => [l.kind, l.score!]));
  });
  process.stdout.write(".");
}
const file = `eval/pred-${reader.replace(/\W+/g, "_")}.json`;
writeFileSync(file, JSON.stringify({ reader, msPerDoc: timings.reduce((a, b) => a + b, 0) / timings.length, predictions: out, raws }, null, 1));
console.log(`\nwrote ${file}; ${(timings.reduce((a, b) => a + b, 0) / timings.length / 1000).toFixed(1)} s per document`);

// Runs the whole pipeline on each real terms document and records the card Catch would show.
// Usage: tsx eval/services.ts [ollama-model]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { analyzeTerms, topFindings } from "../src/core/analyze";
import { buildExitPlan } from "../src/core/exitPlan";
import { OllamaGemma } from "../src/model/gemma";

const modelName = process.argv[2];
const classifier = modelName ? new OllamaGemma(modelName) : undefined;
const rows: { service: string; url: string; card: { kind: string; plain: string; quote: string }[]; steps: string[]; ms: number; candidates: number }[] = [];
for (const f of readdirSync("eval/cache").filter((f) => f.endsWith(".txt")).sort()) {
  const [service, url, , ...rest] = readFileSync(`eval/cache/${f}`, "utf8").split("\n");
  const r = await analyzeTerms(rest.join("\n"), classifier, 12);
  const card = topFindings(r.findings).map((x) => ({ kind: x.kind, plain: x.plain, quote: x.quote }));
  rows.push({ service: service!, url: url!, card, steps: buildExitPlan(r.findings, r.terms, new Date(2026, 9, 25)).steps, ms: Math.round(r.ms), candidates: r.candidates.length });
  process.stdout.write(`${service}: ${card.map((c) => c.kind).join(", ") || "nothing"} (${(r.ms / 1000).toFixed(1)} s)\n`);
}
writeFileSync(`eval/services-${(modelName ?? "rules").replace(/\W+/g, "_")}.json`, JSON.stringify(rows, null, 1));

import { extractFacts } from "../core/facts";
import type { Candidate, TrapKind } from "../core/types";
import { BrowserGemma, type ModelKey } from "../model/gemma";

// Dev-only: reads eval/pool.json through Vite's file server and scores every suspected kind.
const log = document.getElementById("log")!;
const say = (s: string) => (log.textContent += s + "\n");
const key = (new URLSearchParams(location.search).get("model") ?? "gemma-4-e2b") as ModelKey;

const pool = (await (await fetch("/@fs/Users/kinnu/dev.to/catch/eval/pool.json")).json()) as { key: string; text: string; ruleKinds: TrapKind[] }[];
const gemma = new BrowserGemma(key, (p) => (document.title = `${Math.round((p.loaded / p.total) * 100)}% ${p.file ?? ""}`));
const t0 = performance.now();
await gemma.load();
say(`${key} loaded in ${((performance.now() - t0) / 1000).toFixed(1)} s`);

const byDoc = new Map<string, typeof pool>();
for (const item of pool) byDoc.set(item.key.split("#")[0]!, [...(byDoc.get(item.key.split("#")[0]!) ?? []), item]);

const predictions: Record<string, { kinds: string[]; plain: string[]; scores: Record<string, number> }> = {};
const timings: number[] = [];
for (const [doc, items] of byDoc) {
  const candidates: Candidate[] = items.map((it, i) => ({
    id: i + 1,
    sentence: { index: i, text: it.text, start: 0, end: it.text.length },
    kinds: it.ruleKinds,
    score: 3,
    facts: extractFacts(it.text),
  }));
  const s = performance.now();
  const labels = await gemma.classify(candidates, 0.5);
  timings.push(performance.now() - s);
  items.forEach((it, i) => {
    const mine = labels.filter((l) => l.id === i + 1);
    predictions[it.key] = { kinds: mine.filter((l) => l.keep).map((l) => l.kind), plain: [], scores: Object.fromEntries(mine.map((l) => [l.kind, l.score!])) };
  });
  say(`${doc}: ${((performance.now() - s) / 1000).toFixed(1)} s`);
}
const msPerDoc = timings.reduce((a, b) => a + b, 0) / timings.length;
(window as unknown as { __eval: unknown }).__eval = { reader: `${key}-browser`, msPerDoc, predictions };
say(`done: ${(msPerDoc / 1000).toFixed(2)} s per document`);
document.title = "done";

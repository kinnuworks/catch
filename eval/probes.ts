// Scores the eight hand-picked probe sentences from the write-up with each Ollama model.
// Usage: tsx eval/probes.ts gemma3:1b gemma4:e2b-it-qat
import { writeFileSync } from "node:fs";
import type { TrapKind } from "../src/core/types";
import { VERIFY_SYSTEM, verifyPrompt } from "../src/core/verify";
import { OllamaGemma } from "../src/model/gemma";

const PROBES: [string, TrapKind, boolean][] = [
  ["All amounts paid are non-refundable.", "no_refund", true],
  ["You may cancel at any time and receive a prorated refund for the unused period.", "no_refund", false],
  ["If you or Spotify terminate these Terms, Spotify shall have no liability to you.", "lock_in", false],
  ["If your Services are subject to a minimum term agreement and you terminate before the end of the term, you will be charged an early termination fee.", "exit_fee", true],
  ["We will provide at least 30 days' notice prior to any new terms taking effect.", "cancel_notice", false],
  ["Subscriptions automatically renew until cancelled in the Manage Subscriptions section of your account settings.", "auto_renew", true],
  ["Credits are non-refundable, non-transferable, and no interest will accrue on them.", "lock_in", false],
  ["In case of a termination before the end of a billing cycle, Babbel will provide you with a pro rata refund of Service Fees for the remainder.", "exit_fee", false],
];

const out: Record<string, { text: string; kind: string; gold: boolean; p: number }[]> = {};
for (const model of process.argv.slice(2)) {
  const g = new OllamaGemma(model);
  out[model] = [];
  for (const [text, kind, gold] of PROBES) out[model]!.push({ text, kind, gold, p: await g.scoreYes(VERIFY_SYSTEM, verifyPrompt(text, kind)) });
  console.log(model.padEnd(20), out[model]!.map((r) => `${r.gold ? "Y" : "n"}:${r.p.toFixed(2)}`).join(" "));
}
writeFileSync("eval/probes.json", JSON.stringify(out, null, 1));

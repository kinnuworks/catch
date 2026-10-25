import { extractDurations, extractMoney, formatDuration, formatMoney } from "./facts";
import { findCandidates } from "./lexicon";
import { splitSentences } from "./sentences";
import { collectTermFacts, type TermFacts } from "./termFacts";
import type { Candidate, Classifier, Finding, ModelLabel, TrapKind } from "./types";

/** Higher first: the card shows at most three findings, money before inconvenience. */
const PRIORITY: Record<TrapKind, number> = {
  exit_fee: 6,
  lock_in: 5,
  trial_converts: 4,
  cancel_notice: 3,
  auto_renew: 2,
  no_refund: 1,
};

/**
 * Numbers in the model's sentence must exist in the source sentence.
 * If the model invents "$30" where the terms say "$300", we fall back to our own wording.
 */
export function plainIsGrounded(plain: string, source: string): boolean {
  const sourceMoney = new Set(extractMoney(source).map((m) => m.amount));
  const sourceDurations = new Set(extractDurations(source).map((d) => `${d.value}:${d.unit}`));
  const sourceNumbers = new Set([
    ...(source.match(/\d+(?:\.\d+)?/g) ?? []).map(Number),
    ...extractDurations(source).map((d) => d.value),
    ...sourceMoney,
  ]);
  for (const m of extractMoney(plain)) if (!sourceMoney.has(m.amount)) return false;
  for (const d of extractDurations(plain)) {
    if (!sourceDurations.has(`${d.value}:${d.unit}`) && !sourceNumbers.has(d.value)) return false;
  }
  for (const n of (plain.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)) {
    if (!sourceNumbers.has(n)) return false;
  }
  return plain.length > 0 && plain.length <= 160;
}

/** Our own wording, used when the model's line fails the grounding check or no model is loaded. */
export function fallbackPlain(kind: TrapKind, c: Candidate): string {
  const fee = c.facts.money[0];
  const span = c.facts.durations.find((d) => d.unit !== "day") ?? c.facts.durations[0];
  const days = c.facts.durations.find((d) => d.unit === "day");
  switch (kind) {
    case "exit_fee":
      return fee ? `Leaving early costs ${formatMoney(fee)}.` : "Leaving early costs money.";
    case "lock_in":
      return span ? `You're committed for ${formatDuration(span)}, even if it's billed monthly.` : "You can't cancel for free right away.";
    case "trial_converts":
      return fee ? `The trial turns into a paid plan at ${formatMoney(fee)}.` : "The free trial turns into a paid plan unless you cancel.";
    case "cancel_notice": {
      const how = c.facts.channels[0];
      if (days && how) return `Cancelling needs ${formatDuration(days)} notice, ${how}.`;
      if (days) return `Cancelling needs ${formatDuration(days)} notice.`;
      return how ? `You have to cancel ${how}.` : "Cancelling has a deadline or a set process.";
    }
    case "auto_renew":
      return span ? `It renews every ${formatDuration(span)} until you cancel.` : "It keeps charging you until you cancel.";
    case "no_refund":
      return "Money you've paid isn't refunded.";
  }
}

export function labelsToFindings(candidates: Candidate[], labels: ModelLabel[], source: Finding["source"]): Finding[] {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const findings: Finding[] = [];
  for (const label of labels) {
    const c = byId.get(label.id);
    if (!c || label.keep === false) continue;
    const plain = plainIsGrounded(label.plain, c.sentence.text) ? label.plain : fallbackPlain(label.kind, c);
    findings.push({
      kind: label.kind,
      quote: c.sentence.text,
      start: c.sentence.start,
      end: c.sentence.end,
      plain,
      facts: c.facts,
      source,
    });
  }
  return findings.sort((a, b) => PRIORITY[b.kind] - PRIORITY[a.kind] || a.start - b.start);
}

/** Rules-only labels: what Catch shows before the model has downloaded, or with no WebGPU. */
export function ruleLabels(candidates: Candidate[]): ModelLabel[] {
  return candidates
    .filter((c) => c.score >= 3)
    .map((c) => {
      const kind = [...c.kinds].sort((a, b) => PRIORITY[b] - PRIORITY[a])[0]!;
      return { id: c.id, kind, plain: "" };
    });
}

export interface AnalyzeResult {
  candidates: Candidate[];
  terms: TermFacts;
  findings: Finding[];
  classifier: string;
  ms: number;
}

export async function analyzeTerms(text: string, classifier?: Classifier, limit?: number): Promise<AnalyzeResult> {
  const t0 = performance.now();
  const sentences = splitSentences(text);
  const terms = collectTermFacts(sentences);
  const candidates = findCandidates(sentences, { limit });
  const done = (findings: Finding[], name: string): AnalyzeResult => ({ candidates, terms, findings, classifier: name, ms: performance.now() - t0 });
  if (candidates.length === 0) return done([], classifier?.name ?? "rules");
  if (!classifier) return done(labelsToFindings(candidates, ruleLabels(candidates), "rules"), "rules");
  const labels = await classifier.classify(candidates);
  return done(labelsToFindings(candidates, labels, "model"), classifier.name);
}

const richness = (f: Finding) => f.facts.money.length * 2 + f.facts.durations.length + f.facts.channels.length;

/** One card line per kind, strongest kind first, and within a kind the sentence with the most numbers. */
export function topFindings(findings: Finding[], max = 3): Finding[] {
  const ordered = [...findings].sort((a, b) => PRIORITY[b.kind] - PRIORITY[a.kind] || richness(b) - richness(a) || a.start - b.start);
  const seen = new Set<TrapKind>();
  const out: Finding[] = [];
  for (const f of ordered) {
    if (seen.has(f.kind)) continue;
    seen.add(f.kind);
    out.push(f);
    if (out.length === max) break;
  }
  return out;
}

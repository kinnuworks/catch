import { extractFacts } from "./facts";
import type { Candidate, Sentence, TrapKind } from "./types";

interface Rule {
  kind: TrapKind;
  weight: number;
  re: RegExp;
}

// Wide on purpose: this stage decides what the model gets to read, so a miss here
// is a miss everywhere. Precision comes from the model and from the fact checks.
const RULES: Rule[] = [
  { kind: "auto_renew", weight: 3, re: /\b(?:auto(?:matically)?[- ]?renew(?:s|ed|al|ing)?|renews? automatically)\b/i },
  { kind: "auto_renew", weight: 2, re: /\b(?:recurring (?:billing|charges?|payments?)|continu(?:e|es|ing) (?:to be )?(?:billed|charged)|until (?:you )?cancel(?:l?ed)?|billed (?:monthly|annually|each (?:month|year)))\b/i },
  { kind: "trial_converts", weight: 3, re: /\bfree trial\b[^.]{0,160}\b(?:automatically|will be (?:charged|billed)|convert|unless you cancel|end of (?:the|your) (?:free )?trial)\b/i },
  { kind: "trial_converts", weight: 2, re: /\b(?:after|at the end of|once) (?:the|your) (?:free )?trial\b/i },
  { kind: "lock_in", weight: 3, re: /\b(?:minimum (?:term|period|commitment|subscription|contract)|commitment (?:term|period)|initial (?:term|period|commitment)|lock[- ]?in)\b/i },
  { kind: "lock_in", weight: 3, re: /\b(?:may|can|will) not (?:be able to )?cancel\b[^.]{0,80}\b(?:until|before|during|within)\b/i },
  { kind: "lock_in", weight: 2, re: /\b(?:annual|yearly|12[- ]month) (?:plan|subscription|commitment|contract)\b[^.]{0,80}\b(?:paid|billed|payable) monthly\b|\bbilled monthly\b[^.]{0,80}\b(?:annual|yearly|12[- ]month)\b/i },
  { kind: "lock_in", weight: 2, re: /\b(?:\d+|three|six|twelve|eighteen|twenty-four)[- ](?:month|year)s? (?:term|commitment|contract|agreement|minimum)\b/i },
  { kind: "exit_fee", weight: 3, re: /\b(?:early )?(?:termination|cancell?ation|exit|break|buy-?out) fee\b/i },
  { kind: "exit_fee", weight: 2, re: /\b(?:remaining|outstanding|balance of (?:the|your)) (?:months|payments|balance|term|fees|contract)\b|\bremainder of (?:the|your) (?:term|commitment|contract|subscription)\b|\bcancel(?:l?ing|l?ation)? early\b/i },
  { kind: "exit_fee", weight: 2, re: /\b(?:\d{1,3})\s?% of (?:the|your)? ?(?:remaining|outstanding)\b/i },
  { kind: "cancel_notice", weight: 3, re: /\b(?:\d+|thirty|sixty|ninety|fourteen|seven)[- ](?:calendar |business )?days?'?s? (?:prior |advance )?(?:written )?notice\b/i },
  { kind: "cancel_notice", weight: 2, re: /\b(?:notice (?:period|of cancell?ation)|(?:in writing|by (?:certified |registered )?(?:mail|post|letter))|cancel(?:l?ations?)? must be (?:made|received|submitted))\b/i },
  { kind: "cancel_notice", weight: 1, re: /\b(?:at least|no later than|before the end of)\b[^.]{0,60}\b(?:renewal|billing) (?:date|period|cycle)\b/i },
  { kind: "no_refund", weight: 3, re: /\b(?:non-?refundable|no refunds?|will not (?:be )?refund(?:ed)?|not (?:be )?(?:eligible|entitled) (?:for|to) (?:a )?refund|no (?:partial|pro-?rat(?:a|ed)) refunds?)\b/i },
];

const CANCEL_CONTEXT = /\b(?:cancel|terminat|renew|subscri|trial|billing|charge|fee|refund|commitment|term)\w*/i;

function isHeading(text: string): boolean {
  const words = text.split(/\s+/);
  if (words.length < 3) return true;
  if (/[.!?;:)"”]$/.test(text)) return false;
  const capitalised = words.filter((w) => /^[A-Z0-9]/.test(w)).length;
  return capitalised / words.length > 0.6;
}

export interface CandidateOptions {
  /** Cap on how many sentences the model reads; small models do better with fewer. */
  limit?: number;
}

export function findCandidates(sentences: Sentence[], options: CandidateOptions = {}): Candidate[] {
  const limit = options.limit ?? 24;
  const scored: Candidate[] = [];
  const seen = new Set<string>();
  for (const sentence of sentences) {
    if (!CANCEL_CONTEXT.test(sentence.text)) continue;
    // Headings like "Fees and Purchase Terms; Automatically Renewing Subscriptions" aren't clauses,
    // but "All fees are non-refundable." is. A heading has no closing punctuation and is mostly capitalised.
    if (isHeading(sentence.text)) continue;
    // Terms repeat themselves (summary box, then full text); the model only needs each sentence once.
    const norm = sentence.text.toLowerCase().replace(/\W+/g, " ").trim();
    if (seen.has(norm)) continue;
    seen.add(norm);
    const kinds = new Set<TrapKind>();
    let score = 0;
    for (const rule of RULES) {
      if (rule.re.test(sentence.text)) {
        kinds.add(rule.kind);
        score += rule.weight;
      }
    }
    if (kinds.size === 0) continue;
    const facts = extractFacts(sentence.text);
    score += Math.min(2, facts.money.length + facts.durations.length);
    scored.push({ id: 0, sentence, kinds: [...kinds], score, facts });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.sentence.index - b.sentence.index)
    .slice(0, limit)
    .sort((a, b) => a.sentence.index - b.sentence.index)
    .map((c, i) => ({ ...c, id: i + 1 }));
}

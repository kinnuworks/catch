import { TRAP_KINDS, type Candidate, type ModelLabel, type TrapKind } from "./types";

export const SYSTEM_PROMPT = `You read the fine print on sign-up pages for a consumer. You are given numbered sentences taken from the terms. For each sentence that puts a cost, a delay or a restriction on the customer, return one label.

Kinds:
- auto_renew: the plan renews or keeps charging until the customer cancels.
- trial_converts: a free or cheap trial turns into a paid plan.
- lock_in: the customer cannot cancel, or cannot cancel for free, before a minimum period ends, even if billed monthly.
- exit_fee: leaving early costs money (a fee, or paying the remaining months).
- cancel_notice: cancelling needs advance notice, a deadline, or a specific channel such as post or phone.
- no_refund: money already paid is not returned.

Rules:
- Use only the sentence ids you are given. Skip sentences that are only definitions, protect the customer, or are about something else.
- "plain" is one short sentence a friend would say, under 20 words, second person, no legal words. Use the numbers that appear in the sentence and no others.
- Answer with a JSON array only, for example: [{"id": 2, "kind": "lock_in", "plain": "You can't cancel during the first 3 months."}]. Answer [] if nothing applies.`;

export function buildUserPrompt(candidates: Candidate[]): string {
  return candidates.map((c) => `${c.id}. ${c.sentence.text}`).join("\n");
}

const KIND_SET = new Set<string>(TRAP_KINDS);

/** Pulls the first JSON array out of model output and keeps only well-formed labels. */
export function parseLabels(output: string, validIds: Set<number>): ModelLabel[] {
  const cleaned = output.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  let body = cleaned.slice(start, end + 1).replace(/,\s*([\]}])/g, "$1");
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    // Small models sometimes emit one object per line without commas.
    body = body.replace(/}\s*{/g, "},{");
    try {
      parsed = JSON.parse(body);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const labels: ModelLabel[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const { id, kind, plain } = item as Record<string, unknown>;
    const numericId = typeof id === "string" ? Number(id) : id;
    if (typeof numericId !== "number" || !validIds.has(numericId)) continue;
    if (typeof kind !== "string" || !KIND_SET.has(kind)) continue;
    const key = `${numericId}:${kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push({ id: numericId, kind: kind as TrapKind, plain: typeof plain === "string" ? plain.trim() : "" });
  }
  return labels;
}

/** One sentence per call: far easier for a 1B model than a numbered batch. */
export const SENTENCE_SYSTEM_PROMPT = `You read one sentence from the terms on a sign-up page and say what it does to the customer.

Kinds:
auto_renew = keeps charging until the customer cancels
trial_converts = a free or cheap trial turns into a paid plan
lock_in = the customer can't cancel, or can't cancel for free, before a minimum period ends
exit_fee = leaving early costs money (a fee, or paying the rest of the term)
cancel_notice = cancelling needs advance notice, a deadline, or a set channel like post or phone
no_refund = money already paid is not returned
none = none of these, or the sentence protects the customer

Answer on one line: the kinds, comma separated, then " | ", then what it means in under 20 plain words using only numbers from the sentence. If none apply, answer: none

Examples:
Sentence: Your plan renews automatically each month until you cancel.
Answer: auto_renew | It keeps charging you every month until you cancel.
Sentence: You may cancel at any time and receive a prorated refund.
Answer: none
Sentence: If you cancel within the 12-month term, you must pay 50% of the remaining monthly payments.
Answer: lock_in, exit_fee | Leaving in the first 12 months costs half of what's left.
Sentence: Cancellation requests must be made by phone at least 30 days before renewal.
Answer: cancel_notice | You have to phone at least 30 days before it renews.
Sentence: After your 14-day free trial, you will be charged $9.99 per month.
Answer: trial_converts, auto_renew | After 14 free days it costs $9.99 a month.
Sentence: All fees are non-refundable.
Answer: no_refund | You won't get money back.
Sentence: We may update these terms from time to time.
Answer: none`;

export function buildSentencePrompt(text: string): string {
  return `Sentence: ${text}\nAnswer:`;
}

const KIND_ALIASES: Record<string, TrapKind> = {
  non_refundable: "no_refund",
  nonrefundable: "no_refund",
  refund: "no_refund",
  renewal: "auto_renew",
  autorenew: "auto_renew",
  trial: "trial_converts",
  lockin: "lock_in",
  early_termination_fee: "exit_fee",
  termination_fee: "exit_fee",
  cancellation_fee: "exit_fee",
  notice: "cancel_notice",
};

/** Reads "lock_in, exit_fee | plain words" (or "none") into labels for one candidate. */
export function parseSentenceAnswer(output: string, id: number): ModelLabel[] {
  const line = output.replace(/^\s*answer:\s*/i, "").split("\n").find((l) => l.trim().length > 0)?.trim() ?? "";
  const [kindPart = "", plainPart = ""] = line.split("|");
  const labels: ModelLabel[] = [];
  for (const token of kindPart.toLowerCase().split(/[,\s]+/)) {
    const word = token.replace(/[^a-z_]/g, "");
    const kind = KIND_SET.has(word) ? (word as TrapKind) : KIND_ALIASES[word];
    if (kind && !labels.some((l) => l.kind === kind)) labels.push({ id, kind, plain: plainPart.trim() });
  }
  return labels;
}

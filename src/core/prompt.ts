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

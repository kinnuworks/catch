import type { Candidate, ModelLabel, TrapKind } from "./types";

/**
 * Sends one yes/no prompt to a model and returns P(yes) from the next-token probabilities.
 * Reading the probability instead of the word sidesteps the "always yes" habit of small
 * models: the threshold is calibrated on labelled data instead of trusting the sampled token.
 */
export type ScoreYes = (system: string, user: string) => Promise<number>;

/**
 * The card's cut-off. Tuning for F1 on half the labelled services picks 0.05-0.23 (eval/results.md);
 * the card uses a stricter 0.5, which measured 90% precision at 65% recall, because false alarms
 * teach people to ignore the card.
 */
export const DEFAULT_THRESHOLD = 0.5;

export interface TokenProb {
  token: string;
  logprob: number;
}

/** P(yes) out of the yes/no mass among the top next tokens. */
export function yesProbability(top: TokenProb[]): number {
  let yes = 0;
  let no = 0;
  for (const t of top) {
    const w = t.token.trim().toLowerCase();
    if (w === "yes") yes += Math.exp(t.logprob);
    else if (w === "no") no += Math.exp(t.logprob);
  }
  return yes + no === 0 ? 0 : yes / (yes + no);
}

// Small models lean towards "yes"; the worked "no" examples pull them back.
export const VERIFY_SYSTEM = `You check whether one sentence from a company's terms says one specific thing. Answer yes only if the sentence itself clearly says it. Answer no if the sentence is about something else, only mentions the topic, is a heading, or protects the customer. Answer with one word: yes or no.

Sentence: "You can cancel at any time and get a refund for the unused part of the month."
Question: Does this sentence say money the customer already paid will not be refunded?
Answer: no

Sentence: "If you cancel during the first 12 months, you must pay the remaining monthly payments."
Question: Does this sentence say the customer must pay a fee, or the remaining payments, if they cancel early?
Answer: yes

Sentence: "We may change these terms and will give you 30 days' notice of material changes."
Question: Does this sentence say cancelling needs advance notice, a deadline, or a specific method such as mail, phone or a particular page?
Answer: no

Sentence: "Your subscription renews automatically each month until you turn off auto-renew."
Question: Does this sentence say the plan renews, or keeps charging the customer, until they cancel?
Answer: yes

Sentence: "We may suspend or terminate your account if you break these terms."
Question: Does this sentence say the customer cannot cancel, or cannot cancel for free, until a minimum period has passed?
Answer: no`;

export const QUESTIONS: Record<TrapKind, string> = {
  auto_renew: "Does this sentence say the plan renews, or keeps charging the customer, until they cancel?",
  trial_converts: "Does this sentence say a free or cheap trial turns into a paid plan?",
  lock_in: "Does this sentence say the customer cannot cancel, or cannot cancel for free, until a minimum period has passed?",
  exit_fee: "Does this sentence say the customer must pay a fee, or the remaining payments, if they cancel early?",
  cancel_notice: "Does this sentence say cancelling needs advance notice, a deadline, or a specific method such as mail, phone or a particular page?",
  no_refund: "Does this sentence say money the customer already paid will not be refunded?",
};

export function verifyPrompt(sentence: string, kind: TrapKind): string {
  return `Sentence: "${sentence}"\nQuestion: ${QUESTIONS[kind]}\nAnswer yes or no.`;
}

/**
 * Rules propose, the model confirms. For each candidate the model only judges the kinds the
 * rules suspected. Every score is returned so callers can apply (or calibrate) a threshold.
 */
export async function verifyCandidates(candidates: Candidate[], score: ScoreYes, threshold = DEFAULT_THRESHOLD): Promise<ModelLabel[]> {
  const labels: ModelLabel[] = [];
  for (const c of candidates) {
    for (const kind of c.kinds) {
      const p = await score(VERIFY_SYSTEM, verifyPrompt(c.sentence.text, kind));
      labels.push({ id: c.id, kind, plain: "", score: p, keep: p >= threshold });
    }
  }
  return labels;
}

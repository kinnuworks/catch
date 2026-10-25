export type TrapKind =
  | "auto_renew"
  | "trial_converts"
  | "lock_in"
  | "exit_fee"
  | "cancel_notice"
  | "no_refund";

export const TRAP_KINDS: readonly TrapKind[] = [
  "auto_renew",
  "trial_converts",
  "lock_in",
  "exit_fee",
  "cancel_notice",
  "no_refund",
];

export interface Money {
  amount: number;
  currency: string;
  raw: string;
}

export interface Duration {
  value: number;
  unit: "day" | "week" | "month" | "year";
  raw: string;
}

/** Facts pulled from a sentence by code, never by the model. */
export interface Facts {
  money: Money[];
  durations: Duration[];
  /** How cancelling has to happen, when the sentence says so. */
  channels: string[];
}

export interface Sentence {
  index: number;
  text: string;
  /** Character offset in the source text, so the UI can scroll to it. */
  start: number;
  end: number;
}

export interface Candidate {
  id: number;
  sentence: Sentence;
  kinds: TrapKind[];
  score: number;
  facts: Facts;
}

export interface Finding {
  kind: TrapKind;
  /** The source sentence, verbatim. */
  quote: string;
  start: number;
  end: number;
  /** One plain-English line for the card. */
  plain: string;
  facts: Facts;
  /** Where the label came from. */
  source: "model" | "rules";
}

export interface ModelLabel {
  id: number;
  kind: TrapKind;
  plain: string;
  /** P(yes) when the label came from a verifying model. */
  score?: number;
  /** False when the model scored the label below the threshold; such labels are kept for evaluation only. */
  keep?: boolean;
}

/** Anything that can turn candidates into labels: Gemma in the browser, Ollama, or a test double. */
export interface Classifier {
  readonly name: string;
  classify(candidates: Candidate[]): Promise<ModelLabel[]>;
}

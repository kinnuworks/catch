import { extractDurations } from "./facts";
import type { Duration, Sentence } from "./types";

export interface Located<T> {
  value: T;
  sentence: Sentence;
}

/** Durations that terms spread over neighbouring sentences ("Your 7-day free trial starts..."). */
export interface TermFacts {
  trialLength?: Located<Duration>;
  lockLength?: Located<Duration>;
  noticeLength?: Located<Duration>;
}

const TRIAL_RE = /\b(?:free )?trial\b/i;
const LOCK_RE = /\b(?:minimum|commitment|initial (?:term|period)|lock[- ]?in|contract (?:term|period))\b/i;
const NOTICE_RE = /\bnotice\b|\bbefore (?:your|the) (?:next )?(?:billing|renewal) date\b/i;

function pick(sentences: Sentence[], re: RegExp, units: Duration["unit"][], near: RegExp): Located<Duration> | undefined {
  for (const sentence of sentences) {
    if (!re.test(sentence.text)) continue;
    const durations = extractDurations(sentence.text).filter((d) => units.includes(d.unit) && d.raw !== "monthly" && d.raw !== "annual");
    if (durations.length === 0) continue;
    // Prefer the duration written right next to the keyword: "7-day free trial", "three (3) months" after "commitment period of".
    const best = durations.find((d) => near.test(sentence.text.slice(Math.max(0, sentence.text.indexOf(d.raw) - 60), sentence.text.indexOf(d.raw) + d.raw.length + 30))) ?? durations[0]!;
    return { value: best, sentence };
  }
  return undefined;
}

export function collectTermFacts(sentences: Sentence[]): TermFacts {
  return {
    trialLength: pick(sentences, TRIAL_RE, ["day", "week", "month"], /trial/i),
    lockLength: pick(sentences, LOCK_RE, ["month", "year", "week"], /minimum|commitment|term|period|lock/i),
    noticeLength: pick(sentences, NOTICE_RE, ["day", "week"], /notice|before/i),
  };
}

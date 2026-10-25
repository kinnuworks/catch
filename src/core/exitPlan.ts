import { durationToDays, formatMoney } from "./facts";
import type { TermFacts } from "./termFacts";
import type { Duration, Finding, Money } from "./types";

export interface ExitPlan {
  signedUpOn: Date;
  /** Last day to cancel without paying anything, if there is a trial. */
  freeCancelBy?: Date;
  /** First day you can leave without an exit fee, if there is a lock-in. */
  penaltyFreeFrom?: Date;
  /** Day to send notice by, so cancelling lands on penaltyFreeFrom. */
  noticeBy?: Date;
  exitFee?: Money;
  channel?: string;
  /** What to do, in order, written from the terms. */
  steps: string[];
  /** The sentences each date and amount came from, verbatim. */
  quotes: string[];
}

/** Calendar days, not 24-hour blocks, so a DST change can't move a deadline by a day. */
function addDays(d: Date, days: number): Date {
  const out = new Date(d.getTime());
  out.setDate(out.getDate() + days);
  return out;
}

/** Calendar months, not 30-day blocks: a 3-month lock-in from Jan 31 ends Apr 30. */
export function addDuration(d: Date, dur: Duration): Date {
  if (dur.unit === "month" || dur.unit === "year") {
    const months = dur.unit === "year" ? dur.value * 12 : dur.value;
    const out = new Date(d.getTime());
    const day = out.getDate();
    out.setDate(1);
    out.setMonth(out.getMonth() + months);
    const lastDay = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
    out.setDate(Math.min(day, lastDay));
    return out;
  }
  return addDays(d, durationToDays(dur));
}

function firstDuration(f: Finding | undefined, units: Duration["unit"][]): Duration | undefined {
  return f?.facts.durations.find((d) => units.includes(d.unit));
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Turns findings into dates. Everything here is plain arithmetic on numbers that code
 * pulled out of the quoted sentences; the model never picks a date.
 */
export function buildExitPlan(findings: Finding[], terms: TermFacts = {}, signedUpOn = new Date(), safetyDays = 2): ExitPlan {
  const today = startOfDay(signedUpOn);
  // Several sentences can share a kind; prefer the one that carries the number we need.
  const byKind = (k: Finding["kind"], has: (f: Finding) => boolean = () => true) => {
    const all = findings.filter((f) => f.kind === k);
    return all.find(has) ?? all[0];
  };
  const trial = byKind("trial_converts", (f) => f.facts.durations.some((d) => d.unit === "day" || d.unit === "week"));
  const lock = byKind("lock_in", (f) => f.facts.durations.some((d) => d.unit === "month" || d.unit === "year"));
  const fee = byKind("exit_fee", (f) => f.facts.money.length > 0);
  const notice = byKind("cancel_notice", (f) => f.facts.durations.some((d) => d.unit === "day"));

  const plan: ExitPlan = { signedUpOn: today, steps: [], quotes: [] };
  const cite = (...texts: (string | undefined)[]) => {
    for (const t of texts) if (t && !plan.quotes.includes(t)) plan.quotes.push(t);
  };

  // A date needs both a trap the model confirmed and a length that code read from the terms.
  const trialOwn = firstDuration(trial, ["day", "week"]);
  const trialLength = trialOwn ?? terms.trialLength?.value;
  if (trial && trialLength) {
    plan.freeCancelBy = addDays(addDuration(today, trialLength), -safetyDays);
    cite(trial.quote, trialOwn ? undefined : terms.trialLength?.sentence.text);
  }

  const lockOwn = firstDuration(lock, ["month", "year", "week"]);
  const lockLength = lockOwn ?? terms.lockLength?.value;
  const noticeOwn = firstDuration(notice, ["day", "week"]);
  const noticeLength = noticeOwn ?? terms.noticeLength?.value;
  if (lock && lockLength) {
    const lockStart = plan.freeCancelBy ? addDays(plan.freeCancelBy, safetyDays) : today;
    plan.penaltyFreeFrom = addDuration(lockStart, lockLength);
    cite(lock.quote, lockOwn ? undefined : terms.lockLength?.sentence.text);
    if (notice && noticeLength) {
      plan.noticeBy = addDays(plan.penaltyFreeFrom, -durationToDays(noticeLength) - safetyDays);
      cite(notice.quote, noticeOwn ? undefined : terms.noticeLength?.sentence.text);
    }
  }

  if (fee) {
    plan.exitFee = fee.facts.money[0];
    cite(fee.quote);
  }
  plan.channel = notice?.facts.channels[0] ?? fee?.facts.channels[0] ?? lock?.facts.channels[0];

  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (plan.freeCancelBy) plan.steps.push(`Cancel by ${fmt(plan.freeCancelBy)} to pay nothing.`);
  if (plan.noticeBy) plan.steps.push(`If you stay past the trial, send notice by ${fmt(plan.noticeBy)}${plan.channel ? `, ${plan.channel}` : ""}.`);
  if (plan.penaltyFreeFrom) {
    const cost = plan.exitFee ? ` Leaving before then costs ${formatMoney(plan.exitFee)}.` : "";
    plan.steps.push(`You can leave for free from ${fmt(plan.penaltyFreeFrom)}.${cost}`);
  } else if (plan.exitFee) {
    plan.steps.push(`Leaving early costs ${formatMoney(plan.exitFee)}.`);
  }
  if (!plan.noticeBy && plan.channel) plan.steps.push(`Cancelling has to be done ${plan.channel}.`);
  return plan;
}

export function hasDates(plan: ExitPlan): boolean {
  return Boolean(plan.freeCancelBy || plan.penaltyFreeFrom || plan.noticeBy);
}

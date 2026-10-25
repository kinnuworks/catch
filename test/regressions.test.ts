import { describe, expect, it } from "vitest";
import { fallbackPlain } from "../src/core/analyze";
import { buildExitPlan } from "../src/core/exitPlan";
import { extractDurations, extractMoney } from "../src/core/facts";
import { findCandidates } from "../src/core/lexicon";
import { splitSentences } from "../src/core/sentences";
import type { Finding } from "../src/core/types";

// Each case here was a bug found in review; the comment says what used to happen.

describe("hyphenated numbers", () => {
  it("reads twenty-four months as 24, not 4", () => {
    expect(extractDurations("a twenty-four month contract").map((d) => [d.value, d.unit])).toEqual([[24, "month"]]);
    expect(extractDurations("thirty-six months").map((d) => d.value)).toEqual([36]);
    expect(extractDurations("a twenty-one day trial").map((d) => d.value)).toEqual([21]);
  });
});

describe("European money", () => {
  it("reads 29,99 € and 1.299,00 EUR", () => {
    expect(extractMoney("only 29,99 € per month").map((m) => [m.amount, m.currency])).toEqual([[29.99, "EUR"]]);
    expect(extractMoney("a fee of €29,99").map((m) => m.amount)).toEqual([29.99]);
    expect(extractMoney("total 1.299,00 EUR").map((m) => m.amount)).toEqual([1299]);
    expect(extractMoney("US style $1,299.00").map((m) => m.amount)).toEqual([1299]);
  });
});

describe("sentence splitting", () => {
  it("splits after words that look like abbreviations", () => {
    const s = splitSentences("We sell digital art. Your subscription renews every month. Residents of the U.S. Some rules apply.");
    expect(s.map((x) => x.text)).toEqual([
      "We sell digital art.",
      "Your subscription renews every month.",
      "Residents of the U.S.",
      "Some rules apply.",
    ]);
  });

  it("keeps numbered references together", () => {
    expect(splitSentences("See Art. 12 of these terms for details.")).toHaveLength(1);
  });
});

describe("short clauses", () => {
  it("keeps 'All fees are non-refundable.' but drops headings", () => {
    const texts = findCandidates(splitSentences("All fees are non-refundable.\n\nAutomatically Renewing Subscriptions And Billing Terms\n\nAll sales are final and no refunds are given.")).map((c) => c.sentence.text);
    expect(texts).toContain("All fees are non-refundable.");
    expect(texts.some((t) => t.startsWith("Automatically Renewing"))).toBe(false);
  });
});

describe("dates across daylight saving", () => {
  it("counts calendar days, not 24-hour blocks", () => {
    const trial: Finding = {
      kind: "trial_converts", quote: "", start: 0, end: 0, plain: "", source: "rules",
      facts: { money: [], durations: [{ value: 7, unit: "day", raw: "7-day" }], channels: [] },
    };
    // Oct 22 + 7 days = Oct 29, minus the 2-day margin = Oct 27, whatever the time zone does on Oct 25.
    const plan = buildExitPlan([trial], {}, new Date(2026, 9, 22, 0, 30));
    expect([plan.freeCancelBy!.getMonth(), plan.freeCancelBy!.getDate()]).toEqual([9, 27]);
  });
});

describe("card wording", () => {
  const cand = (text: string) => findCandidates(splitSentences(text))[0]!;

  it("only says 'billed monthly' when the sentence does", () => {
    expect(fallbackPlain("lock_in", cand("You agree to a minimum term of twelve months under this agreement."))).toBe("You're committed for 12 months.");
    expect(fallbackPlain("lock_in", cand("The plan is billed monthly with a minimum term of 3 months."))).toContain("billed monthly");
  });

  it("picks the fee, not the monthly price", () => {
    expect(fallbackPlain("exit_fee", cand("Your plan costs $29.99 per month, and cancelling early triggers an early termination fee of $300."))).toBe("Leaving early costs $300.");
  });
});

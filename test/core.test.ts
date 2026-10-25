import { describe, expect, it } from "vitest";
import { analyzeTerms, fallbackPlain, labelsToFindings, plainIsGrounded, topFindings } from "../src/core/analyze";
import { buildExitPlan, addDuration } from "../src/core/exitPlan";
import { extractChannels, extractDurations, extractMoney } from "../src/core/facts";
import { toICS } from "../src/core/ics";
import { findCandidates } from "../src/core/lexicon";
import { parseLabels } from "../src/core/prompt";
import { splitSentences } from "../src/core/sentences";
import type { Candidate, Classifier, ModelLabel } from "../src/core/types";
import { LOCKIN_TERMS } from "./fixtures";

describe("splitSentences", () => {
  it("does not split prices, abbreviations or section numbers", () => {
    const s = splitSentences("You pay $29.99 per month, e.g. on the 1st. See section 4.2 for details. Then it renews.");
    expect(s.map((x) => x.text)).toEqual([
      "You pay $29.99 per month, e.g. on the 1st.",
      "See section 4.2 for details.",
      "Then it renews.",
    ]);
  });

  it("keeps offsets that point back at the source", () => {
    const text = "First sentence is here.\n\nSecond one follows here.";
    for (const s of splitSentences(text)) expect(text.slice(s.start, s.end)).toBe(s.text);
  });
});

describe("facts", () => {
  it("reads money in symbol and code form", () => {
    expect(extractMoney("a fee of $300 or USD 1,200.50 or 15 EUR").map((m) => [m.amount, m.currency])).toEqual([
      [300, "USD"], [1200.5, "USD"], [15, "EUR"],
    ]);
  });

  it("reads written-out and bracketed durations", () => {
    expect(extractDurations("three (3) months and a 7-day trial and 14 days notice").map((d) => [d.value, d.unit])).toEqual([
      [3, "month"], [7, "day"], [14, "day"],
    ]);
  });

  it("names the cancel channel", () => {
    expect(extractChannels("must be submitted in writing to support")).toEqual(["in writing / by post"]);
    expect(extractChannels("you must call us to cancel")).toEqual(["by phone"]);
  });
});

describe("findCandidates", () => {
  const candidates = findCandidates(splitSentences(LOCKIN_TERMS));

  it("finds every trap in the lock-in terms and skips the privacy line", () => {
    const kinds = new Set(candidates.flatMap((c) => c.kinds));
    for (const k of ["trial_converts", "auto_renew", "lock_in", "exit_fee", "cancel_notice", "no_refund"] as const) {
      expect(kinds.has(k)).toBe(true);
    }
    expect(candidates.some((c) => /privacy/i.test(c.sentence.text))).toBe(false);
  });

  it("numbers candidates from 1 in document order", () => {
    expect(candidates.map((c) => c.id)).toEqual(candidates.map((_, i) => i + 1));
    const starts = candidates.map((c) => c.sentence.start);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });
});

describe("parseLabels", () => {
  const ids = new Set([1, 2, 3]);

  it("accepts fenced JSON with a trailing comma", () => {
    expect(parseLabels('```json\n[{"id": 2, "kind": "lock_in", "plain": "x"},]\n```', ids)).toEqual([{ id: 2, kind: "lock_in", plain: "x" }]);
  });

  it("repairs objects with no commas between them", () => {
    expect(parseLabels('[{"id":1,"kind":"exit_fee","plain":"a"} {"id":3,"kind":"no_refund","plain":"b"}]', ids)).toHaveLength(2);
  });

  it("drops unknown ids, unknown kinds and duplicates", () => {
    const out = parseLabels('[{"id":9,"kind":"exit_fee"},{"id":1,"kind":"spooky"},{"id":1,"kind":"exit_fee"},{"id":"1","kind":"exit_fee"}]', ids);
    expect(out).toEqual([{ id: 1, kind: "exit_fee", plain: "" }]);
  });

  it("returns nothing for prose", () => {
    expect(parseLabels("There are no traps here.", ids)).toEqual([]);
  });
});

describe("grounding", () => {
  it("rejects a plain line whose money is not in the source", () => {
    expect(plainIsGrounded("Leaving early costs $30.", "an early termination fee of $300 will be charged")).toBe(false);
    expect(plainIsGrounded("Leaving early costs $300.", "an early termination fee of $300 will be charged")).toBe(true);
  });

  it("accepts digits for numbers the source spells out", () => {
    expect(plainIsGrounded("You can't leave for 3 months.", "a minimum commitment period of three months")).toBe(true);
  });

  it("falls back to its own wording when the model invents a number", () => {
    const [c] = findCandidates(splitSentences("If you cancel during the minimum term, an early termination fee of $300 will be charged."));
    const findings = labelsToFindings([c!], [{ id: c!.id, kind: "exit_fee", plain: "It costs $3,000 to leave." }], "model");
    expect(findings[0]!.plain).toBe(fallbackPlain("exit_fee", c!));
    expect(findings[0]!.plain).toContain("$300");
  });
});

describe("analyzeTerms", () => {
  it("quotes source sentences verbatim, whatever the classifier says", async () => {
    const fake: Classifier = {
      name: "fake",
      async classify(cands: Candidate[]): Promise<ModelLabel[]> {
        return cands.map((c) => ({ id: c.id, kind: c.kinds[0]!, plain: "Totally made up 999." }));
      },
    };
    const result = await analyzeTerms(LOCKIN_TERMS, fake);
    expect(result.findings.length).toBeGreaterThan(0);
    for (const f of result.findings) {
      expect(LOCKIN_TERMS.replace(/\s+/g, " ")).toContain(f.quote);
      expect(f.plain).not.toContain("999");
    }
  });

  it("ranks the exit fee first on the card", async () => {
    const result = await analyzeTerms(LOCKIN_TERMS);
    expect(topFindings(result.findings)[0]!.kind).toBe("exit_fee");
  });
});

describe("exit plan", () => {
  it("adds calendar months, clamping to the end of the month", () => {
    const d = addDuration(new Date(2026, 0, 31), { value: 1, unit: "month", raw: "" });
    expect([d.getMonth(), d.getDate()]).toEqual([1, 28]);
  });

  it("works out the dates for the lock-in terms", async () => {
    const { findings, terms } = await analyzeTerms(LOCKIN_TERMS);
    const plan = buildExitPlan(findings, terms, new Date(2026, 9, 25));
    // 7-day trial from Oct 25 ends Nov 1; cancel two days early to be safe.
    expect(plan.freeCancelBy?.toDateString()).toBe(new Date(2026, 9, 30).toDateString());
    // Three months from the first paid day (Nov 1) is Feb 1.
    expect(plan.penaltyFreeFrom?.toDateString()).toBe(new Date(2027, 1, 1).toDateString());
    expect(plan.exitFee?.amount).toBe(300);
    expect(plan.steps.join(" ")).toMatch(/\$300/);
  });

  it("writes a valid, folded calendar file", async () => {
    const { findings, terms } = await analyzeTerms(LOCKIN_TERMS);
    const ics = toICS(buildExitPlan(findings, terms, new Date(2026, 9, 25)), "Tempo Pro", "https://example.com/signup");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261030");
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});

import { describe, expect, it } from "vitest";
import { findCandidates } from "../src/core/lexicon";
import { splitSentences } from "../src/core/sentences";
import { QUESTIONS, RULES_DECIDE, verifyCandidates, verifyPrompt, yesProbability } from "../src/core/verify";
import { yesFromLogits } from "../src/model/gemma";

describe("yesProbability", () => {
  it("normalises over yes and no spellings only", () => {
    const p = yesProbability([
      { token: "yes", logprob: Math.log(0.6) },
      { token: " Yes", logprob: Math.log(0.1) },
      { token: "no", logprob: Math.log(0.2) },
      { token: "maybe", logprob: Math.log(0.1) },
    ]);
    expect(p).toBeCloseTo(0.7 / 0.9, 5);
  });

  it("is 0 when neither answer is in the top tokens", () => {
    expect(yesProbability([{ token: "Sure", logprob: -0.1 }])).toBe(0);
  });
});

describe("yesFromLogits", () => {
  it("reads only the last position and is stable for large logits", () => {
    // vocab of 4: [yes, Yes, no, No]; two positions, the first must be ignored.
    const logits = { dims: [1, 2, 4], data: Float32Array.from([50, 50, -50, -50, 1000, 999, 998, 0]) };
    const p = yesFromLogits(logits, [0, 1], [2, 3]);
    const e = (x: number) => Math.exp(x - 1000);
    expect(p).toBeCloseTo((e(1000) + e(999)) / (e(1000) + e(999) + e(998) + e(0)), 6);
  });
});

describe("verifyCandidates", () => {
  const candidates = findCandidates(splitSentences("An early termination fee of $300 applies if you cancel during the minimum term. All fees are non-refundable."));

  it("asks one question per suspected kind and applies the threshold", async () => {
    const asked: string[] = [];
    const labels = await verifyCandidates(candidates, async (_system, user) => {
      asked.push(user);
      return user.includes("refunded") ? 0.2 : 0.9;
    }, 0.5);
    expect(asked.length).toBe(candidates.reduce((n, c) => n + c.kinds.filter((k) => !RULES_DECIDE.has(k)).length, 0));
    expect(labels.filter((l) => l.keep).map((l) => l.kind)).not.toContain("no_refund");
    expect(labels.filter((l) => !RULES_DECIDE.has(l.kind)).every((l) => typeof l.score === "number")).toBe(true);
    expect(labels.filter((l) => RULES_DECIDE.has(l.kind)).every((l) => l.keep)).toBe(true);
  });

  it("puts the sentence and the kind's question in the prompt", () => {
    const prompt = verifyPrompt("All fees are non-refundable.", "no_refund");
    expect(prompt).toContain('"All fees are non-refundable."');
    expect(prompt).toContain(QUESTIONS.no_refund);
  });
});

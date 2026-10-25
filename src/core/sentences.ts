import type { Sentence } from "./types";

// Tokens that end in a period without ending a sentence.
const ABBREVIATIONS = new Set([
  "e.g", "i.e", "etc", "inc", "ltd", "llc", "co", "corp", "no", "vs", "mr", "mrs", "ms", "dr",
  "st", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
  "approx", "incl", "art", "sec", "para", "u.s", "u.k",
]);

function isAbbreviation(text: string, dotIndex: number): boolean {
  let i = dotIndex - 1;
  while (i >= 0 && /[A-Za-z.]/.test(text[i]!)) i--;
  const word = text.slice(i + 1, dotIndex).toLowerCase();
  if (i >= 0 && /\d/.test(text[i]!)) return false; // "the 1st." is an ordinal, not "St."
  if (word.length === 1) return true; // initials, list markers like "a."
  return ABBREVIATIONS.has(word);
}

/**
 * Splits terms text into sentences and keeps character offsets.
 * Handles prices ($9.99), section numbers (4.2), abbreviations and
 * line-broken lists, which is where naive splitters cut legal text in half.
 */
export function splitSentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  let start = 0;
  const push = (end: number) => {
    const raw = text.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (trimmed.length >= 12 && /[a-z]/i.test(trimmed)) {
      out.push({ index: out.length, text: trimmed.replace(/\s+/g, " "), start: start + lead, end: start + lead + trimmed.length });
    }
    start = end;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "\n" && text[i + 1] === "\n") {
      push(i);
      continue;
    }
    if (ch !== "." && ch !== "!" && ch !== "?" && ch !== ";") continue;
    const next = text[i + 1];
    if (next !== undefined && !/\s|["'”’)]/.test(next)) continue; // 9.99, 4.2, example.com
    if (ch === "." && isAbbreviation(text, i)) continue;
    if (ch === ";" && i - start < 60) continue; // keep short clauses together
    let end = i + 1;
    while (end < text.length && /["'”’)]/.test(text[end]!)) end++;
    push(end);
  }
  push(text.length);
  return out;
}

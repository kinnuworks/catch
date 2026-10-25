import type { Sentence } from "./types";

// Titles keep the sentence going even before a capital: "Dr. Smith", "Mr. Lee".
const TITLES = new Set(["mr", "mrs", "ms", "dr", "st", "prof"]);
// Abbreviations that only shorten a word when a number follows: "No. 4", "Art. 12".
const NUMBERED = new Set(["no", "nos", "art", "vol", "p", "pp"]);

function isAbbreviation(text: string, dotIndex: number): boolean {
  let i = dotIndex - 1;
  while (i >= 0 && /[A-Za-z.]/.test(text[i]!)) i--;
  if (i >= 0 && /\d/.test(text[i]!)) return false; // "the 1st." is an ordinal, not "St."
  const word = text.slice(i + 1, dotIndex).toLowerCase();
  const next = text.slice(dotIndex + 1).match(/^\s*(\S)/)?.[1] ?? "";
  if (NUMBERED.has(word)) return /\d/.test(next);
  if (/[a-z]/.test(next)) return true; // "e.g. on", "U.S. residents": the sentence goes on
  return TITLES.has(word) || (word.length === 1 && /[A-Z]/.test(text[dotIndex - 1]!)); // initials: "J. Doe"
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

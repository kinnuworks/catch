import type { Duration, Facts, Money } from "./types";

const UNITS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const WORD_NUMBERS: Record<string, number> = {
  ...UNITS, ...TENS, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, a: 1, an: 1,
};
// "twenty-four", "thirty six": compounds have to be matched before their last word on its own.
for (const [t, tv] of Object.entries(TENS)) for (const [u, uv] of Object.entries(UNITS)) {
  WORD_NUMBERS[`${t}-${u}`] = tv + uv;
  WORD_NUMBERS[`${t} ${u}`] = tv + uv;
}

const CURRENCY_SYMBOLS: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP", "₹": "INR", "¥": "JPY" };
const CURRENCY_CODES = ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY"];

// 1,299.00 (US/UK) or 1.299,00 / 29,99 (most of Europe).
const AMOUNT = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
const MONEY_RE = new RegExp(
  String.raw`(?:(?<sym>[$€£₹¥])\s?(?<a1>${AMOUNT}))` +
    String.raw`|(?:(?<a2>${AMOUNT})\s?(?:(?<code>${CURRENCY_CODES.join("|")})\b|(?<sym2>[€£₹¥])))` +
    String.raw`|(?:\b(?<code2>${CURRENCY_CODES.join("|")})\s?(?<a3>${AMOUNT}))`,
  "g",
);

/** "1.299,00" and "29,99" use a comma for decimals; "1,299.00" uses a dot. */
function parseAmount(raw: string): number {
  const comma = raw.lastIndexOf(","), dot = raw.lastIndexOf(".");
  const decimalComma = comma > dot && raw.length - comma - 1 <= 2;
  const normal = decimalComma ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  return Number(normal);
}

const NUMBER = String.raw`(?:\d+|${Object.keys(WORD_NUMBERS).sort((a, b) => b.length - a.length).join("|")})`;
const DURATION_RE = new RegExp(
  String.raw`\b(?<n>${NUMBER})(?:\s*\(\d+\))?[\s-]+(?:calendar\s+|full\s+|consecutive\s+|business\s+)?(?<unit>day|week|month|year)s?\b`,
  "gi",
);
const PERIOD_WORDS: Record<string, Duration["unit"]> = { annual: "year", yearly: "year", monthly: "month", weekly: "week" };

const CHANNEL_PATTERNS: [RegExp, string][] = [
  [/\b(?:by|via|through)\s+(?:certified\s+|registered\s+)?(?:post|mail|letter)\b|\bin writing\b|\bwritten notice\b/i, "in writing"],
  [/\b(?:by|via)\s+(?:tele)?phone\b|\bcall(?:ing)?\s+(?:us|our|customer)\b/i, "by phone"],
  [/\bin person\b|\bat (?:the|your) (?:club|location|branch|store)\b/i, "in person"],
  [/\b(?:account settings|settings page|online|in the app|through the app)\b/i, "online / in the app"],
  [/\b(?:e-?mail(?:ing)?)\s+(?:us|our|support)\b/i, "by email"],
];

function toNumber(token: string): number | undefined {
  const t = token.toLowerCase();
  if (/^\d+$/.test(t)) return Number(t);
  return WORD_NUMBERS[t];
}

export function extractMoney(text: string): Money[] {
  const out: Money[] = [];
  for (const m of text.matchAll(MONEY_RE)) {
    const g = m.groups ?? {};
    const rawAmount = g.a1 ?? g.a2 ?? g.a3;
    if (!rawAmount) continue;
    const symbol = g.sym ?? g.sym2;
    const currency = symbol ? CURRENCY_SYMBOLS[symbol]! : (g.code ?? g.code2)!.toUpperCase();
    out.push({ amount: parseAmount(rawAmount), currency, raw: m[0].trim() });
  }
  return out;
}

export function extractDurations(text: string): Duration[] {
  const out: Duration[] = [];
  for (const m of text.matchAll(DURATION_RE)) {
    const value = toNumber(m.groups!.n!);
    if (value === undefined || value <= 0 || value > 1000) continue;
    out.push({ value, unit: m.groups!.unit!.toLowerCase() as Duration["unit"], raw: m[0].trim() });
  }
  for (const [word, unit] of Object.entries(PERIOD_WORDS)) {
    if (new RegExp(String.raw`\b${word}\s+(?:term|commitment|contract|plan|subscription)\b`, "i").test(text)) {
      out.push({ value: 1, unit, raw: word });
    }
  }
  return out;
}

export function extractChannels(text: string): string[] {
  return CHANNEL_PATTERNS.filter(([re]) => re.test(text)).map(([, label]) => label);
}

export function extractFacts(text: string): Facts {
  return { money: extractMoney(text), durations: extractDurations(text), channels: extractChannels(text) };
}

export function durationToDays(d: Duration): number {
  switch (d.unit) {
    case "day": return d.value;
    case "week": return d.value * 7;
    case "month": return d.value * 30;
    case "year": return d.value * 365;
  }
}

export function formatDuration(d: Duration): string {
  return `${d.value} ${d.unit}${d.value === 1 ? "" : "s"}`;
}

export function formatMoney(m: Money): string {
  const symbol = Object.entries(CURRENCY_SYMBOLS).find(([, code]) => code === m.currency)?.[0];
  const amount = Number.isInteger(m.amount) ? String(m.amount) : m.amount.toFixed(2);
  return symbol ? `${symbol}${amount}` : `${amount} ${m.currency}`;
}

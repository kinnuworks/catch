const CTA_RE = /\b(?:start (?:my |your )?(?:free )?trial|try (?:it )?(?:free|for free)|free trial|subscribe|sign ?up|join(?: now)?|get started|start (?:my |your )?membership|upgrade|buy now|place order|start plan|continue to payment|confirm (?:and|&) pay|pay now)\b/i;
const TERMS_LINK_RE = /\b(?:terms|conditions|subscription (?:terms|agreement)|billing|auto-?renew|cancell?ation|membership agreement|offer details|see details)\b/i;
const TERMS_HINT_RE = /\b(?:renew|cancel|trial|billed|charged|commitment|minimum|fee|refund|terms)\b/i;

function isVisible(e: Element): boolean {
  const r = e.getBoundingClientRect();
  if (r.width < 20 || r.height < 12) return false;
  const s = getComputedStyle(e);
  return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05;
}

// Tag checks, not instanceof: elements from iframes or parsed documents come from another realm.
function labelOf(e: Element): string {
  if (e.tagName === "INPUT") return (e as HTMLInputElement).value || e.getAttribute("aria-label") || "";
  return (e.getAttribute("aria-label") || (e as HTMLElement).innerText || e.textContent || "").trim();
}

// A paid sign-up has a price, a trial or billing words near its button; a newsletter "Subscribe" doesn't.
const PAID_CONTEXT_RE = /[$€£₹¥]\s?\d|\d\s?(?:USD|EUR|GBP|INR)\b|\b(?:free trial|per month|\/\s?mo(?:nth)?\b|a month|monthly|annually|per year|\/\s?yr|billed|subscription|membership|plan)\b/i;

function hasPaidContext(e: HTMLElement): boolean {
  let node: HTMLElement | null = e;
  for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
    if (PAID_CONTEXT_RE.test(node.innerText ?? node.textContent ?? "")) return true;
  }
  return false;
}

/** True for pages Catch can read. The rules and dates are English-only, so other pages are skipped. */
export function isEnglishPage(doc: Document = document): boolean {
  const lang = (doc.documentElement.lang || "").toLowerCase();
  return lang === "" || lang.startsWith("en");
}

/** The sign-up or checkout button the user is about to press, if this page has one. */
export function findCallToAction(doc: Document = document): HTMLElement | undefined {
  if (!isEnglishPage(doc)) return undefined;
  const candidates = [...doc.querySelectorAll<HTMLElement>('button, a[role="button"], a[href], input[type="submit"], input[type="button"], [role="button"]')]
    .filter((e) => {
      const label = labelOf(e);
      return label.length > 0 && label.length < 60 && CTA_RE.test(label) && isVisible(e) && hasPaidContext(e);
    });
  // The biggest matching button is the one the page wants you to press.
  return candidates.sort((a, b) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    return rb.width * rb.height - ra.width * ra.height;
  })[0];
}

export function ctaLabel(cta: HTMLElement): string {
  return labelOf(cta).replace(/\s+/g, " ");
}

/** Visible text from the part of the page around the button: the form, the plan box and its fine print. */
export function pageTermsText(cta: HTMLElement | undefined, doc: Document = document): string {
  const chunks = new Set<string>();
  let node: HTMLElement | null = cta ?? null;
  for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
    const text = node.innerText ?? "";
    if (text.length > 200 && TERMS_HINT_RE.test(text)) {
      chunks.add(text);
      if (text.length > 4000) break;
    }
  }
  // Fine print often sits outside the form, in a footer or a details element.
  for (const e of doc.querySelectorAll<HTMLElement>("small, details, [class*='fine' i], [class*='disclaimer' i], [class*='legal' i], [class*='terms' i], footer")) {
    const text = e.innerText ?? "";
    if (text.length > 40 && TERMS_HINT_RE.test(text)) chunks.add(text);
  }
  return [...chunks].join("\n\n").slice(0, 60_000);
}

/** Links to the actual terms, which is usually where the lock-in lives. */
export function termsLinks(doc: Document = document, max = 3): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of doc.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const label = labelOf(a);
    if (!TERMS_LINK_RE.test(label) || label.length > 60) continue;
    let url: URL;
    try {
      url = new URL(a.href, doc.baseURI);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(url.protocol)) continue;
    url.hash = "";
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    out.push(url.href);
    if (out.length === max) break;
  }
  return out;
}

/** Readable text from fetched HTML, without scripts, menus, headers or hidden elements. */
export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, noscript, nav, header, svg, iframe, [aria-hidden='true']").forEach((n) => n.remove());
  const main = doc.querySelector("main, article, [role='main']") ?? doc.body;
  const blocks: string[] = [];
  main?.querySelectorAll("h1, h2, h3, h4, p, li, td, dd, div:not(:has(*))").forEach((n) => {
    const t = (n.textContent ?? "").replace(/\s+/g, " ").trim();
    if (t.length > 0) blocks.push(t);
  });
  return blocks.join("\n\n").slice(0, 200_000);
}

/** Scrolls to the sentence on the page and highlights it; returns false if the text isn't on this page. */
export function scrollToQuote(quote: string, doc: Document = document): boolean {
  const needle = quote.slice(0, 60).replace(/\s+/g, " ");
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.textContent ?? "").replace(/\s+/g, " ");
    const at = text.indexOf(needle.slice(0, 40));
    if (at === -1) continue;
    const parent = n.parentElement;
    if (!parent) continue;
    parent.scrollIntoView({ behavior: "smooth", block: "center" });
    const range = doc.createRange();
    range.selectNodeContents(parent);
    const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
    const HighlightCtor = (globalThis as unknown as { Highlight?: new (r: Range) => unknown }).Highlight;
    if (registry && HighlightCtor) registry.set("catch-quote", new HighlightCtor(range));
    else parent.style.outline = "3px solid #f59e0b";
    return true;
  }
  return false;
}

/** A text-fragment link that opens the terms page scrolled to the sentence. */
export function quoteLink(url: string, quote: string): string {
  const words = quote.split(/\s+/);
  const start = words.slice(0, 5).join(" ");
  const end = words.length > 10 ? words.slice(-4).join(" ") : "";
  const frag = end ? `${encodeURIComponent(start)},${encodeURIComponent(end)}` : encodeURIComponent(quote);
  return `${url.split("#")[0]}#:~:text=${frag}`;
}

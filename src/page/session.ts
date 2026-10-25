import { analyzeTerms, topFindings, type AnalyzeResult } from "../core/analyze";
import { buildExitPlan, hasDates, type ExitPlan } from "../core/exitPlan";
import type { Classifier, Finding } from "../core/types";
import { CatchCard } from "../ui/card";
import { ctaLabel, findCallToAction, pageTermsText, quoteLink, scrollToQuote, termsLinks } from "./detect";

export interface Source {
  url: string;
  text: string;
}

export interface SessionOptions {
  doc?: Document;
  /** Fetches a linked terms page and returns its readable text. */
  fetchText?: (url: string) => Promise<string | undefined>;
  /** Resolves once the model is ready; until then the card shows the rule-based read. */
  classifier?: () => Promise<Classifier | undefined>;
  service?: string;
  onPlan?: (plan: ExitPlan, service: string, url: string) => void;
  onResult?: (r: AnalyzeResult & { sources: Source[] }) => void;
}

interface Located extends Finding {
  url: string;
  onPage: boolean;
}

function joinSources(sources: Source[]): { text: string; at: (offset: number) => Source } {
  const bounds: { start: number; source: Source }[] = [];
  let text = "";
  for (const s of sources) {
    bounds.push({ start: text.length, source: s });
    text += s.text + "\n\n";
  }
  return { text, at: (offset) => [...bounds].reverse().find((b) => b.start <= offset)!.source };
}

export function serviceName(doc: Document): string {
  const og = doc.querySelector<HTMLMetaElement>('meta[property="og:site_name"]')?.content;
  if (og) return og.trim();
  const host = new URL(doc.URL).hostname.replace(/^www\./, "");
  return host.split(".")[0]!.replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * One pass over a sign-up page: find the button, read the terms around it and behind its
 * links, show the card, and write the exit plan when the button is pressed.
 */
export async function runSession(opts: SessionOptions = {}): Promise<{ card: CatchCard; result: AnalyzeResult } | undefined> {
  const doc = opts.doc ?? document;
  const cta = findCallToAction(doc);
  if (!cta) return undefined;

  const sources: Source[] = [];
  const pageText = pageTermsText(cta, doc);
  if (pageText) sources.push({ url: doc.URL, text: pageText });

  const card = new CatchCard();
  card.renderLoading("Looking for renewals, lock-ins and exit fees…");
  const detach = card.anchorTo(cta);
  const close = () => {
    detach();
    card.remove();
  };

  if (opts.fetchText) {
    const fetched = await Promise.all(termsLinks(doc).map(async (url) => ({ url, text: (await opts.fetchText!(url)) ?? "" })));
    sources.push(...fetched.filter((s) => s.text.length > 200));
  }
  if (sources.length === 0) {
    close();
    return undefined;
  }

  const joined = joinSources(sources);
  const service = opts.service ?? serviceName(doc);
  const locate = (fs: Finding[]): Located[] =>
    fs.map((f) => {
      const src = joined.at(f.start);
      return { ...f, url: src.url, onPage: src.url === doc.URL };
    });
  const show = (r: AnalyzeResult, by: string) => {
    const located = locate(topFindings(r.findings));
    card.renderFindings({
      findings: located,
      checkedBy: by,
      onClose: close,
      onQuote: (f) => {
        const l = f as Located;
        if (l.onPage && scrollToQuote(l.quote, doc)) return;
        window.open(quoteLink(l.url, l.quote), "_blank", "noopener");
      },
    });
    opts.onResult?.({ ...r, sources });
  };

  let result = await analyzeTerms(joined.text);
  show(result, "rules");

  // Listen on the document from the start, using whatever read is ready: the rules now, Gemma's
  // later. Single-page apps re-render the button, so a listener on the element itself goes stale.
  let planned = false;
  const handlePress = (target: Element | null) => {
    if (planned || !(target instanceof HTMLElement) || !(target === cta || ctaLabel(target) === ctaLabel(cta))) return;
    const plan = buildExitPlan(result.findings, result.terms);
    if (!hasDates(plan) && !plan.exitFee) return;
    planned = true;
    // Saved before the page can navigate away; the next page shows it again if this one unloads.
    opts.onPlan?.(plan, service, doc.URL);
    card.renderPlan(plan, service, doc.URL, close);
  };
  doc.addEventListener("click", (e) => handlePress(e.target instanceof Element ? e.target.closest("button, a, input, [role='button']") : null), { capture: true });
  doc.addEventListener("submit", (e) => handlePress((e as SubmitEvent).submitter ?? cta), { capture: true });

  const classifier = await opts.classifier?.().catch(() => undefined);
  if (classifier && !planned) {
    try {
      result = await analyzeTerms(joined.text, classifier);
      if (!planned) show(result, `checked by ${classifier.name}`);
    } catch (err) {
      console.warn("[catch] model failed, keeping the rule-based read", err);
    }
  }

  return { card, result };
}

export { ctaLabel };

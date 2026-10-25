import { analyzeTerms, topFindings } from "../core/analyze";
import { buildExitPlan } from "../core/exitPlan";
import type { Classifier } from "../core/types";
import { BrowserGemma, hasWebGPU, MODELS } from "../model/gemma";
import { htmlToText } from "../page/detect";
import { runSession } from "../page/session";

// The sign-up page runs Catch exactly as the extension would, and reports to the landing
// page around it. The model lives here so the landing page never loads a second copy.
export type FromPomelo =
  | { type: "catch-status"; text: string; progress?: number }
  | { type: "catch-paste-result"; findings: { plain: string; quote: string; kind: string }[]; steps: string[]; by: string };
export type ToPomelo = { type: "catch-reader"; reader: string } | { type: "catch-paste"; text: string };

const post = (msg: FromPomelo) => window.parent !== window && window.parent.postMessage(msg, location.origin);
let reader = new URLSearchParams(location.search).get("reader") ?? "rules";
let gemma: BrowserGemma | undefined;

async function classifier(): Promise<Classifier | undefined> {
  if (reader === "rules") return undefined;
  if (!hasWebGPU()) {
    post({ type: "catch-status", text: "This browser has no WebGPU, so the rules are reading on their own." });
    return undefined;
  }
  gemma ??= new BrowserGemma("gemma-4-e2b", (p) => {
    const pct = Math.round((p.loaded / p.total) * 100);
    post({ type: "catch-status", text: `Downloading ${MODELS["gemma-4-e2b"].label} once: ${pct}%`, progress: pct });
  });
  const t0 = performance.now();
  await gemma.load();
  post({ type: "catch-status", text: `Gemma 4 E2B is running on your GPU (ready in ${((performance.now() - t0) / 1000).toFixed(1)} s).`, progress: 100 });
  return gemma;
}

let current: Awaited<ReturnType<typeof runSession>>;
async function run() {
  current?.card.remove();
  post({ type: "catch-status", text: "Reading the terms…" });
  current = await runSession({
    service: "Pomelo Focus",
    fetchText: async (url) => htmlToText(await (await fetch(url)).text()),
    classifier,
    onResult: (r) => {
      const found = topFindings(r.findings).length;
      post({ type: "catch-status", text: `${found} catch${found === 1 ? "" : "es"} found by ${r.classifier === "rules" ? "the rules" : r.classifier} in ${(r.ms / 1000).toFixed(1)} s. Press "Start free trial" for the exit plan.` });
    },
  });
}

window.addEventListener("message", async (e: MessageEvent<ToPomelo>) => {
  if (e.origin !== location.origin) return;
  if (e.data?.type === "catch-reader") {
    reader = e.data.reader;
    await run();
  } else if (e.data?.type === "catch-paste") {
    const result = await analyzeTerms(e.data.text, await classifier());
    post({
      type: "catch-paste-result",
      by: result.classifier,
      findings: topFindings(result.findings, 6).map((f) => ({ plain: f.plain, quote: f.quote, kind: f.kind })),
      steps: buildExitPlan(result.findings, result.terms).steps,
    });
  }
});

void run();

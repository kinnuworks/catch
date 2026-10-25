import { analyzeTerms, topFindings } from "../core/analyze";
import { buildExitPlan } from "../core/exitPlan";
import type { Classifier } from "../core/types";
import { BrowserGemma, hasWebGPU, MODELS, type ModelKey } from "../model/gemma";
import { htmlToText } from "../page/detect";
import { runSession } from "../page/session";

const status = document.getElementById("status")!;
const select = document.getElementById("model") as HTMLSelectElement;
const models = new Map<ModelKey, BrowserGemma>();

function classifierFor(value: string): (() => Promise<Classifier | undefined>) | undefined {
  if (value === "rules") return undefined;
  if (!hasWebGPU()) {
    status.textContent = "No WebGPU in this browser, so the rules read the terms on their own.";
    return undefined;
  }
  const key = value as ModelKey;
  return async () => {
    let gemma = models.get(key);
    if (!gemma) {
      gemma = new BrowserGemma(key, (p) => {
        status.textContent = `Downloading ${MODELS[key].label} once: ${Math.round((p.loaded / p.total) * 100)}%`;
      });
      models.set(key, gemma);
    }
    const t0 = performance.now();
    await gemma.load();
    status.textContent = `${MODELS[key].label} ready on your GPU (${((performance.now() - t0) / 1000).toFixed(1)} s).`;
    return gemma;
  };
}

let current: Awaited<ReturnType<typeof runSession>>;

async function run() {
  current?.card.remove();
  status.textContent = "Reading the terms…";
  current = await runSession({
    service: "Pomelo Focus",
    fetchText: async (url) => htmlToText(await (await fetch(url)).text()),
    classifier: classifierFor(select.value),
    onResult: (r) => {
      status.textContent = `${status.textContent?.replace(/ Read in .*$/, "") ?? ""} Read in ${(r.ms / 1000).toFixed(1)} s by ${r.classifier}.`.trim();
    },
  });
}

document.getElementById("rerun")!.addEventListener("click", run);
select.addEventListener("change", run);
run();

document.getElementById("read-paste")!.addEventListener("click", async () => {
  const out = document.getElementById("paste-out")!;
  const text = (document.getElementById("paste") as HTMLTextAreaElement).value;
  out.textContent = "Reading…";
  const make = classifierFor(select.value);
  const result = await analyzeTerms(text, make ? await make() : undefined);
  const findings = topFindings(result.findings, 6);
  out.replaceChildren();
  if (findings.length === 0) {
    out.textContent = "No renewal, lock-in or exit-fee clauses found.";
    return;
  }
  const list = document.createElement("ul");
  for (const f of findings) {
    const li = document.createElement("li");
    const strong = document.createElement("strong");
    strong.textContent = f.plain;
    const q = document.createElement("q");
    q.textContent = f.quote;
    li.append(strong, q);
    list.append(li);
  }
  const steps = buildExitPlan(result.findings, result.terms).steps;
  out.append(list);
  if (steps.length) {
    const p = document.createElement("p");
    p.textContent = `Exit plan if you signed up today: ${steps.join(" ")}`;
    out.append(p);
  }
});

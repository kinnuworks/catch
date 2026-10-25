import type { Candidate, Classifier, ModelLabel } from "../core/types";
import { htmlToText } from "../page/detect";
import { runSession } from "../page/session";
import { send } from "./messages";

/** Forwards candidates to Gemma in the background worker, so the model loads once for every tab. */
class BackgroundGemma implements Classifier {
  name = "Gemma";
  async classify(candidates: Candidate[]): Promise<ModelLabel[]> {
    const res = await send({ type: "classify", candidates });
    if ("error" in res) throw new Error(res.error);
    this.name = res.model;
    return res.labels;
  }
}

let running = false;

async function start() {
  if (running || document.querySelector("[data-catch='card']")) return;
  running = true;
  try {
    await session();
  } finally {
    running = false;
  }
}

async function session() {
  await runSession({
    fetchText: async (url) => {
      const res = await send({ type: "fetch-text", url });
      return res.html ? htmlToText(res.html) : undefined;
    },
    classifier: async () => {
      const status = await send({ type: "status" });
      return status.reader === "rules" || !status.webgpu ? undefined : new BackgroundGemma();
    },
    onPlan: (plan, service, url) => {
      void send({
        type: "save-plan",
        plan: {
          service,
          url,
          savedAt: new Date().toISOString(),
          steps: plan.steps,
          quotes: plan.quotes,
          freeCancelBy: plan.freeCancelBy?.toISOString(),
          noticeBy: plan.noticeBy?.toISOString(),
          penaltyFreeFrom: plan.penaltyFreeFrom?.toISOString(),
        },
      });
    },
  });
}

// Sign-up pages often render their button late; give single-page apps a moment.
let tries = 0;
const timer = setInterval(() => {
  tries++;
  void start().then(() => {
    if (document.querySelector("[data-catch='card']") || tries > 5) clearInterval(timer);
  });
}, 1500);

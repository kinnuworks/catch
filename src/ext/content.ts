import type { Candidate, Classifier, ModelLabel } from "../core/types";
import type { ExitPlan } from "../core/exitPlan";
import { htmlToText } from "../page/detect";
import { runSession } from "../page/session";
import { CatchCard } from "../ui/card";
import { send, type SavedPlan } from "./messages";

const PENDING_MS = 10 * 60 * 1000;

/** If the sign-up button navigated away before the plan could be read, show it on the next page. */
async function showPendingPlan(): Promise<void> {
  const { pending } = (await chrome.storage.local.get("pending")) as { pending?: SavedPlan };
  if (!pending || Date.now() - Date.parse(pending.savedAt) > PENDING_MS) return;
  if (new URL(pending.url).hostname !== location.hostname || pending.url === location.href) return;
  await chrome.storage.local.remove("pending");
  const date = (iso?: string) => (iso ? new Date(iso) : undefined);
  const plan: ExitPlan = {
    signedUpOn: new Date(pending.savedAt),
    freeCancelBy: date(pending.freeCancelBy),
    noticeBy: date(pending.noticeBy),
    penaltyFreeFrom: date(pending.penaltyFreeFrom),
    steps: pending.steps,
    quotes: pending.quotes,
  };
  const card = new CatchCard();
  card.renderPlan(plan, pending.service, pending.url, () => card.remove());
  Object.assign(card.host.style, { position: "fixed", right: "16px", bottom: "16px", zIndex: "2147483647" });
  document.body.append(card.host);
}

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
      const saved: SavedPlan = {
        service,
        url,
        savedAt: new Date().toISOString(),
        steps: plan.steps,
        quotes: plan.quotes,
        freeCancelBy: plan.freeCancelBy?.toISOString(),
        noticeBy: plan.noticeBy?.toISOString(),
        penaltyFreeFrom: plan.penaltyFreeFrom?.toISOString(),
      };
      // Written straight from the content script: a message to the worker can be lost if the page unloads.
      void chrome.storage.local.set({ pending: saved });
      void send({ type: "save-plan", plan: saved });
    },
  });
}

void showPendingPlan();

// Sign-up pages often render their button late; give single-page apps a moment.
let tries = 0;
const timer = setInterval(() => {
  tries++;
  void start().then(() => {
    if (document.querySelector("[data-catch='card']") || tries > 5) clearInterval(timer);
  });
}, 1500);

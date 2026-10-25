import { env } from "@huggingface/transformers";
import { BrowserGemma, MODELS, type ModelKey } from "../model/gemma";
import type { OffscreenRequest } from "./messages";

// The model lives in an offscreen document: MV3 service workers are stopped when idle, which
// would drop 3 GB of weights from the GPU every few minutes. This page stays up while Chrome runs.
if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL("ort/");
env.allowLocalModels = false;

let gemma: BrowserGemma | undefined;
let progress = 0;
let ready = false;

function model(key: ModelKey): BrowserGemma {
  if (!gemma || gemma.key !== key) {
    ready = false;
    progress = 0;
    gemma = new BrowserGemma(key, (p) => (progress = Math.round((p.loaded / p.total) * 100)));
    gemma.load().then(() => (ready = true), () => (gemma = undefined));
  }
  return gemma;
}

chrome.runtime.onMessage.addListener((req: OffscreenRequest, _sender, reply) => {
  if (req.target !== "offscreen") return false;
  (async () => {
    if (req.type === "warm") {
      model(req.model);
      return reply({ ok: true });
    }
    if (req.type === "state") return reply({ ready, progress });
    try {
      const m = model(req.model);
      reply({ labels: await m.classify(req.candidates), model: MODELS[m.key].label });
    } catch (err) {
      reply({ error: String(err) });
    }
  })();
  return true;
});

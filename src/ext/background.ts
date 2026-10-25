import { env } from "@huggingface/transformers";
import { BrowserGemma, MODELS } from "../model/gemma";
import type { Reader, Request, SavedPlan } from "./messages";

// Extensions can't load ONNX Runtime from a CDN, so the wasm files ship inside the extension.
if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL("ort/");
env.allowLocalModels = false;

let gemma: BrowserGemma | undefined;
let progress = 0;
let ready = false;

async function reader(): Promise<Reader> {
  const { reader } = await chrome.storage.local.get("reader");
  return (reader as Reader | undefined) ?? "gemma-3-1b";
}

async function model(): Promise<BrowserGemma | undefined> {
  const r = await reader();
  if (r === "rules" || !("gpu" in navigator)) return undefined;
  if (!gemma || gemma.key !== r) {
    ready = false;
    progress = 0;
    gemma = new BrowserGemma(r, (p) => {
      progress = Math.round((p.loaded / p.total) * 100);
    });
    gemma.load().then(() => (ready = true), () => (gemma = undefined));
  }
  return gemma;
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.reader) void model();
});

chrome.runtime.onMessage.addListener((req: Request, _sender, reply) => {
  (async () => {
    switch (req.type) {
      case "classify": {
        const m = await model();
        if (!m) return reply({ error: "rules" });
        try {
          reply({ labels: await m.classify(req.candidates), model: MODELS[m.key].label });
        } catch (err) {
          reply({ error: String(err) });
        }
        return;
      }
      case "fetch-text": {
        try {
          const res = await fetch(req.url, { credentials: "omit", redirect: "follow" });
          const type = res.headers.get("content-type") ?? "";
          if (!res.ok || !type.includes("html")) return reply({ error: `${res.status} ${type}` });
          return reply({ html: (await res.text()).slice(0, 2_000_000) });
        } catch (err) {
          return reply({ error: String(err) });
        }
      }
      case "status":
        await model();
        return reply({ reader: await reader(), ready, progress, webgpu: "gpu" in navigator });
      case "save-plan": {
        const { plans = [] } = (await chrome.storage.local.get("plans")) as { plans?: SavedPlan[] };
        await chrome.storage.local.set({ plans: [req.plan, ...plans].slice(0, 50) });
        return reply({ ok: true });
      }
    }
  })();
  return true; // async reply
});

chrome.runtime.onInstalled.addListener(() => void model());

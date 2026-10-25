import type { Reader, Request, SavedPlan } from "./messages";

// Routes messages, fetches linked terms pages, and keeps the offscreen document (which holds the
// model) alive. The worker itself holds no model state, so Chrome can stop it whenever it likes.

async function reader(): Promise<Reader> {
  const { reader } = await chrome.storage.local.get("reader");
  return (reader as Reader | undefined) ?? "gemma-4-e2b";
}

let creating: Promise<void> | undefined;
async function ensureOffscreen(): Promise<void> {
  const url = chrome.runtime.getURL("offscreen.html");
  const existing = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT], documentUrls: [url] });
  if (existing.length > 0) return;
  creating ??= chrome.offscreen
    .createDocument({ url, reasons: [chrome.offscreen.Reason.WORKERS], justification: "Run Gemma on the GPU with WebGPU to read terms locally." })
    .finally(() => (creating = undefined));
  await creating;
}

async function toOffscreen<T>(msg: Record<string, unknown>): Promise<T> {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ ...msg, target: "offscreen" }) as Promise<T>;
}

async function warm(): Promise<void> {
  const r = await reader();
  if (r !== "rules") await toOffscreen({ type: "warm", model: r });
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.reader) void warm();
});

chrome.runtime.onMessage.addListener((req: Request & { target?: string }, _sender, reply) => {
  if (req.target === "offscreen") return false;
  (async () => {
    switch (req.type) {
      case "classify": {
        const r = await reader();
        if (r === "rules") return reply({ error: "rules" });
        return reply(await toOffscreen({ type: "classify", model: r, candidates: req.candidates }));
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
      case "status": {
        const r = await reader();
        if (r === "rules") return reply({ reader: r, ready: false, webgpu: true });
        const state = await toOffscreen<{ ready: boolean; progress: number }>({ type: "state" });
        return reply({ reader: r, ready: state.ready, progress: state.progress, webgpu: true });
      }
      case "save-plan": {
        const { plans = [] } = (await chrome.storage.local.get("plans")) as { plans?: SavedPlan[] };
        await chrome.storage.local.set({ plans: [req.plan, ...plans].slice(0, 50) });
        return reply({ ok: true });
      }
    }
  })();
  return true;
});

chrome.runtime.onInstalled.addListener(() => void warm());
chrome.runtime.onStartup.addListener(() => void warm());

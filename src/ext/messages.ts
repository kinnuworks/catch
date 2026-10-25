import type { Candidate, ModelLabel } from "../core/types";
import type { ModelKey } from "../model/gemma";

export type Reader = "rules" | ModelKey;

export interface SavedPlan {
  service: string;
  url: string;
  savedAt: string;
  steps: string[];
  quotes: string[];
  freeCancelBy?: string;
  noticeBy?: string;
  penaltyFreeFrom?: string;
}

export type Request =
  | { type: "classify"; candidates: Candidate[] }
  | { type: "fetch-text"; url: string }
  | { type: "status" }
  | { type: "save-plan"; plan: SavedPlan };

export type Response<R extends Request> = R extends { type: "classify" }
  ? { labels: ModelLabel[]; model: string } | { error: string }
  : R extends { type: "fetch-text" }
    ? { html?: string; error?: string }
    : R extends { type: "status" }
      ? { reader: Reader; ready: boolean; progress?: number; webgpu: boolean }
      : { ok: true };

export type OffscreenRequest =
  | { target: "offscreen"; type: "warm"; model: ModelKey }
  | { target: "offscreen"; type: "state" }
  | { target: "offscreen"; type: "classify"; model: ModelKey; candidates: Candidate[] };

export function send<R extends Request>(req: R): Promise<Response<R>> {
  return chrome.runtime.sendMessage(req) as Promise<Response<R>>;
}

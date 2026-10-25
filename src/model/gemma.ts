import { verifyCandidates, yesProbability, type ScoreYes } from "../core/verify";
import type { Candidate, Classifier, ModelLabel } from "../core/types";

export type ModelKey = "gemma-3-1b" | "gemma-4-e2b";

export const MODELS: Record<ModelKey, { id: string; label: string; size: string }> = {
  "gemma-3-1b": { id: "onnx-community/gemma-3-1b-it-ONNX", label: "Gemma 3 1B", size: "0.8 GB" },
  "gemma-4-e2b": { id: "onnx-community/gemma-4-E2B-it-ONNX", label: "Gemma 4 E2B", size: "3.1 GB" },
};

export interface LoadProgress {
  loaded: number;
  total: number;
  file?: string;
}

interface LogitsTensor {
  dims: number[];
  data: ArrayLike<number>;
}

interface Tokenizer {
  encode(text: string, options?: { add_special_tokens?: boolean }): number[];
}

/** P(yes) from the logits at the last position, over the yes/no spellings Gemma uses. */
function yesFromLogits(logits: LogitsTensor, yesIds: number[], noIds: number[]): number {
  const [, length, vocab] = logits.dims as [number, number, number];
  const offset = (length - 1) * vocab;
  const pick = (ids: number[]) => ids.map((id) => Number(logits.data[offset + id]));
  const yes = pick(yesIds);
  const no = pick(noIds);
  const max = Math.max(...yes, ...no);
  const sum = (xs: number[]) => xs.reduce((a, x) => a + Math.exp(x - max), 0);
  return sum(yes) / (sum(yes) + sum(no));
}

function answerIds(tokenizer: Tokenizer): { yes: number[]; no: number[] } {
  const first = (w: string) => tokenizer.encode(w, { add_special_tokens: false })[0]!;
  return { yes: [first("yes"), first("Yes")], no: [first("no"), first("No")] };
}

type Progress = (info: { status: string; loaded?: number; total?: number; file?: string }) => void;

function progressCallback(onProgress?: (p: LoadProgress) => void): Progress {
  return (info) => {
    if ((info.status === "progress" || info.status === "progress_total") && info.total) onProgress?.({ loaded: info.loaded ?? 0, total: info.total, file: info.file });
  };
}

async function loadGemma3(id: string, onProgress?: (p: LoadProgress) => void): Promise<ScoreYes> {
  const tf = await import("@huggingface/transformers");
  const tokenizer = await tf.AutoTokenizer.from_pretrained(id);
  const model = await tf.AutoModelForCausalLM.from_pretrained(id, { dtype: "q4f16", device: "webgpu", progress_callback: progressCallback(onProgress) });
  const ids = answerIds(tokenizer as unknown as Tokenizer);
  return async (system, user) => {
    const inputs = tokenizer.apply_chat_template(
      [{ role: "system", content: system }, { role: "user", content: user }],
      { add_generation_prompt: true, return_dict: true },
    ) as Record<string, unknown>;
    const out = (await model(inputs)) as { logits: LogitsTensor };
    return yesFromLogits(out.logits, ids.yes, ids.no);
  };
}

async function loadGemma4(id: string, onProgress?: (p: LoadProgress) => void): Promise<ScoreYes> {
  const tf = await import("@huggingface/transformers");
  const processor = await tf.AutoProcessor.from_pretrained(id);
  const model = await tf.Gemma4ForConditionalGeneration.from_pretrained(id, { dtype: "q4f16", device: "webgpu", progress_callback: progressCallback(onProgress) });
  const ids = answerIds(processor.tokenizer as unknown as Tokenizer);
  return async (system, user) => {
    const prompt = processor.apply_chat_template(
      [{ role: "system", content: system }, { role: "user", content: [{ type: "text", text: user }] }],
      // enable_thinking is a Gemma 4 template option the typings don't list yet.
      { enable_thinking: false, add_generation_prompt: true } as Record<string, unknown>,
    ) as string;
    const inputs = await processor(prompt, null, null, { add_special_tokens: false });
    const out = (await model(inputs)) as { logits: LogitsTensor };
    return yesFromLogits(out.logits, ids.yes, ids.no);
  };
}

export function hasWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

/** Gemma running on this machine through WebGPU. Nothing leaves the browser after the weights download once. */
export class BrowserGemma implements Classifier {
  readonly name: string;
  private scorer?: Promise<ScoreYes>;

  constructor(readonly key: ModelKey = "gemma-3-1b", private readonly onProgress?: (p: LoadProgress) => void) {
    this.name = MODELS[key].label;
  }

  load(): Promise<ScoreYes> {
    this.scorer ??= (this.key === "gemma-4-e2b" ? loadGemma4 : loadGemma3)(MODELS[this.key].id, this.onProgress);
    return this.scorer;
  }

  async classify(candidates: Candidate[], threshold?: number): Promise<ModelLabel[]> {
    return verifyCandidates(candidates, await this.load(), threshold);
  }
}

/** The same prompt against a local Ollama server, for people who already run bigger models. */
export class OllamaGemma implements Classifier {
  readonly name: string;

  constructor(readonly model = "gemma3:4b", private readonly baseUrl = "http://localhost:11434") {
    this.name = `${model} (Ollama)`;
  }

  readonly scoreYes: ScoreYes = async (system, user) => {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        think: false,
        logprobs: true,
        top_logprobs: 10,
        options: { temperature: 0, num_ctx: 4096, num_predict: 1 },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { logprobs?: { top_logprobs?: { token: string; logprob: number }[] }[] };
    return yesProbability(body.logprobs?.[0]?.top_logprobs ?? []);
  };

  async classify(candidates: Candidate[], threshold?: number): Promise<ModelLabel[]> {
    return verifyCandidates(candidates, this.scoreYes, threshold);
  }
}

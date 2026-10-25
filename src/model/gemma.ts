import { buildSentencePrompt, parseSentenceAnswer, SENTENCE_SYSTEM_PROMPT } from "../core/prompt";
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

type Generate = (system: string, user: string) => Promise<string>;

async function loadGemma3(id: string, onProgress?: (p: LoadProgress) => void): Promise<Generate> {
  const { pipeline } = await import("@huggingface/transformers");
  const generator = await pipeline("text-generation", id, {
    dtype: "q4f16",
    device: "webgpu",
    progress_callback: (info: { status: string; loaded?: number; total?: number; file?: string }) => {
      if (info.status === "progress" && info.total) onProgress?.({ loaded: info.loaded ?? 0, total: info.total, file: info.file });
    },
  });
  return async (system, user) => {
    const out = (await generator(
      [{ role: "system", content: system }, { role: "user", content: user }],
      { max_new_tokens: 48, do_sample: false },
    )) as { generated_text: { content: string }[] }[];
    return out[0]?.generated_text.at(-1)?.content ?? "";
  };
}

async function loadGemma4(id: string, onProgress?: (p: LoadProgress) => void): Promise<Generate> {
  const tf = await import("@huggingface/transformers");
  const processor = await tf.AutoProcessor.from_pretrained(id);
  const model = await tf.Gemma4ForConditionalGeneration.from_pretrained(id, {
    dtype: "q4f16",
    device: "webgpu",
    progress_callback: (info: { status: string; loaded?: number; total?: number; file?: string }) => {
      if (info.status === "progress" && info.total) onProgress?.({ loaded: info.loaded ?? 0, total: info.total, file: info.file });
    },
  });
  return async (system, user) => {
    const prompt = processor.apply_chat_template(
      [{ role: "system", content: system }, { role: "user", content: [{ type: "text", text: user }] }],
      // enable_thinking is a Gemma 4 template option the typings don't list yet.
      { enable_thinking: false, add_generation_prompt: true } as Record<string, unknown>,
    ) as string;
    const inputs = await processor(prompt, null, null, { add_special_tokens: false });
    const outputs = (await model.generate({ ...inputs, max_new_tokens: 48, do_sample: false })) as InstanceType<typeof tf.Tensor>;
    const promptLength = (inputs.input_ids as { dims: number[] }).dims.at(-1)!;
    // Tensor.slice accepts null for "the whole axis"; its typings only allow numbers.
    const generated = (outputs as unknown as { slice: (...axes: unknown[]) => unknown }).slice(null, [promptLength, null]);
    const [text] = processor.batch_decode(generated as InstanceType<typeof tf.Tensor>, { skip_special_tokens: true }) as string[];
    return text ?? "";
  };
}

export function hasWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

/** Gemma running on this machine through WebGPU. Nothing leaves the browser after the weights download once. */
export class BrowserGemma implements Classifier {
  readonly name: string;
  private generate?: Promise<Generate>;

  constructor(readonly key: ModelKey = "gemma-3-1b", private readonly onProgress?: (p: LoadProgress) => void) {
    this.name = MODELS[key].label;
  }

  load(): Promise<Generate> {
    this.generate ??= (this.key === "gemma-4-e2b" ? loadGemma4 : loadGemma3)(MODELS[this.key].id, this.onProgress);
    return this.generate;
  }

  async classify(candidates: Candidate[]): Promise<ModelLabel[]> {
    const generate = await this.load();
    const labels: ModelLabel[] = [];
    for (const c of candidates) {
      labels.push(...parseSentenceAnswer(await generate(SENTENCE_SYSTEM_PROMPT, buildSentencePrompt(c.sentence.text)), c.id));
    }
    return labels;
  }
}

/** The same prompt against a local Ollama server, for people who already run bigger models. */
export class OllamaGemma implements Classifier {
  readonly name: string;

  constructor(readonly model = "gemma3:4b", private readonly baseUrl = "http://localhost:11434") {
    this.name = `${model} (Ollama)`;
  }

  async ask(text: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        think: false,
        options: { temperature: 0, num_ctx: 4096, num_predict: 48 },
        messages: [{ role: "system", content: SENTENCE_SYSTEM_PROMPT }, { role: "user", content: buildSentencePrompt(text) }],
      }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { message?: { content?: string } };
    return body.message?.content ?? "";
  }

  async classify(candidates: Candidate[]): Promise<ModelLabel[]> {
    const labels: ModelLabel[] = [];
    for (const c of candidates) labels.push(...parseSentenceAnswer(await this.ask(c.sentence.text), c.id));
    return labels;
  }
}

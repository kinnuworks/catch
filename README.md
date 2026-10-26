# Catch

Catch is a Chrome extension that reads the terms on a sign-up page at the moment you're about to press "Start free trial". It pins a card next to the button with the catches that cost money: renewals, lock-ins, exit fees, cancellation rules and refunds. Each line quotes the sentence it came from. If you press the button anyway, Catch writes your exit plan, with the last day to cancel for free, as calendar events.

Gemma 4 E2B runs in your browser on your own GPU. The page text never leaves your laptop.

I built it after an app's free trial turned into a "monthly" plan I couldn't cancel for three months. Leaving early cost $300. The rule was in the terms I scrolled past.

**Live demo, no install:** https://kinnuworks.github.io/catch/

## How it works

```
sign-up page ──► find the button ──► read the text around it + the terms page it links to
                                              │
                                   split into sentences (code)
                                              │
                    15 rules pick suspect sentences and guess the kind (code)
                                              │
     Gemma 4 E2B answers one yes/no question per suspected kind; Catch reads
     P(yes) from the next-token logits and keeps labels above a threshold
                                              │
     the card line is written by code from amounts and durations in the quoted
     sentence, so a number on the card always appears in the terms
                                              │
            you press the button ──► exit plan: calendar arithmetic on the quoted
                                     durations ──► .ics file or Google Calendar link
```

Code finds sentences, pulls out amounts and durations, quotes the source and does the date arithmetic. Gemma only decides whether a sentence the rules flagged really is a catch of that kind. It can't add a clause that isn't on the page, and it can't change $300 into $30.

Before the model has downloaded, or on a machine without WebGPU, the card works from the rules alone and says "rules" in its header.

## Install the extension

It isn't on the Chrome Web Store yet.

1. `pnpm install && pnpm build:ext` (or download `dist/ext` from a release).
2. Open `chrome://extensions` and turn on Developer mode.
3. Click "Load unpacked" and pick `dist/ext`.
4. Open the Catch popup and choose a reader. "Rules only" needs no download. "Gemma 4 E2B" downloads about 3.4 GB once; the extension asks for `unlimitedStorage` so the browser keeps it.

## Network use

- The model weights, once, from Hugging Face.
- When a sign-up page links to its own terms ("Subscription Terms", "Terms of Service"), Catch fetches up to three of those pages from that site, without cookies, so it can read them.

Nothing else. No analytics, no server, no account.

## Accuracy

`eval/` holds everything needed to reproduce the numbers in the write-up:

| File | What it is |
|---|---|
| `sources.json` | the 50 services whose terms were fetched; 27 were readable as plain text |
| `pool.json` | 136 candidate sentences the rules picked (up to 8 per service) |
| `labels.json` | the labels: suggested by an AI assistant (`prelabels.json`), then reviewed one by one by me in `review.html` |
| `pred-*.json` | each reader's raw output, including every P(yes) |
| `results.md` | precision, recall and F1 per reader, and the 2-fold calibrated threshold |

The test can only see sentences the rules picked, so recall here means recall among those sentences. A trap phrased in words the rules don't expect is invisible to both the rules and this test.

```bash
npx tsx eval/fetch.ts                  # download the terms in eval/sources.json
npx tsx eval/predict.ts rules          # or an Ollama model, e.g. gemma3:1b
pnpm dev:demo                          # then open /eval.html for Gemma 4 E2B in the browser
npx tsx eval/score.ts eval/labels.json
```

## Develop

```bash
pnpm install
pnpm test          # unit and regression tests for the core
pnpm dev:site      # landing page with the live demo
pnpm build         # dist/ext (extension) and dist/site (static site)
```

`src/core` is the part worth reading: `sentences.ts` (splitter), `lexicon.ts` (rules), `facts.ts` (amounts and durations), `verify.ts` (yes/no scoring), `analyze.ts` (grounding and card wording), `exitPlan.ts` and `ics.ts`.

## Limits

- English terms only.
- Terms inside images, PDFs, iframes from payment providers, or pop-ups that open after a click are missed.
- A trap written in words the rules don't expect is missed by both the rules and the model.
- Dates assume the plan starts today and the trial starts at sign-up. Each deadline keeps a two-day safety margin.
- It's not legal advice. It points at the sentences worth reading.

## License

Code: Apache 2.0. Gemma 4 weights: Apache 2.0, from Google DeepMind.

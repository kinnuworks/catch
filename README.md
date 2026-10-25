# Catch

Catch is a Chrome extension that reads the terms on a sign-up page at the moment you're about to press "Start free trial". A small Gemma model runs in your browser, on your own GPU, and pins a card next to the button with the catches that cost money: renewals, lock-ins, exit fees, cancellation rules and refunds. Each line quotes the exact sentence it came from. If you press the button anyway, Catch writes your exit plan: the last day to cancel for free goes into your calendar, with the steps.

Nothing you browse is sent anywhere. The model weights download once from Hugging Face and the browser caches them.

I built it after an app's free trial turned into a "monthly" plan I couldn't cancel for three months. Leaving early cost $300. The rule was in the terms I scrolled past.

## Try it

- **Demo page:** a made-up sign-up page with the same trap, running Catch in the page. No install needed. Link: _added on deploy_.
- **Extension:** build it (below), open `chrome://extensions`, turn on Developer mode, click "Load unpacked" and pick `dist/ext`. Then open any sign-up page.

## How it works

```
sign-up page ──► find the button ──► read the text around it + the linked terms
                                              │
                                   split into sentences
                                              │
                         rules pick candidate sentences (wide net)
                                              │
              Gemma labels each sentence: auto_renew, trial_converts, lock_in,
              exit_fee, cancel_notice, no_refund, or none, plus one plain line
                                              │
         code checks every number in Gemma's line against the source sentence;
         a line with an invented number is replaced by Catch's own wording
                                              │
                    card next to the button, quotes link to the sentence
                                              │
                 you press the button ──► exit plan: dates computed by code
                                          from the quoted durations ──► .ics
```

The split between code and model is the point of the design. Code finds sentences, pulls out amounts and durations, quotes the source and does the date arithmetic. The model only answers one narrow question per sentence. It can't add a clause that isn't on the page, and it can't change the $300 into $30, because the card only shows numbers that appear in the quoted sentence.

Before the model has downloaded, or on a machine without WebGPU, the card still works from the rules alone and says so.

## Readers

| Reader | Download | Where it runs |
|---|---|---|
| Rules only | none | in the page |
| Gemma 3 1B (default) | 0.8 GB, once | your GPU via WebGPU |
| Gemma 4 E2B | 3.1 GB, once | your GPU via WebGPU |

## Accuracy

_Filled in from `eval/results.md` after the hand-labelled test run._

## Develop

```bash
pnpm install
pnpm test          # unit tests for the core
pnpm dev:demo      # the demo page on localhost
pnpm build         # dist/ext (extension) and dist/demo (static site)
```

The evaluation lives in `eval/`:

```bash
npx tsx eval/fetch.ts          # download the terms of the services in eval/sources.json
npx tsx eval/pool.ts           # pick candidate sentences from each document
npx tsx eval/make-label-page.ts  # build the labelling page
npx tsx eval/predict.ts rules  # or an Ollama model name, e.g. gemma3:1b
npx tsx eval/score.ts ~/Downloads/catch-labels.json
```

## Limits

- It reads what the page and its linked terms say in text. Terms inside images, PDFs or pop-ups that load after a click are missed.
- The rules decide which sentences the model reads. A trap written in words the rules don't expect will be missed by both.
- Dates assume the plan starts today and the trial starts at sign-up. The calendar event keeps a two-day safety margin.
- It's not legal advice. It points at sentences so you can read the two that matter.

## License

Code: Apache 2.0. Gemma weights are covered by the Gemma terms of use.

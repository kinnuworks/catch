Labelled sentences: 136 from 27 services
Method: pre-labelled by an AI assistant, reviewed one by one by the author; 0 of 136 pre-labels changed on review.

## gemma3:1b
kind labels: precision 64%, recall 91%, F1 75%
trap vs no trap: 67% correct
time per document: 0.60 s
  auto_renew      P  63%  R  93%  (gold 43)
  trial_converts  P 100%  R 100%  (gold 10)
  lock_in         P  58%  R  78%  (gold 9)
  exit_fee        P  29%  R 100%  (gold 2)
  cancel_notice   P  28%  R  56%  (gold 9)
  no_refund       P  88%  R 100%  (gold 28)

## gemma4:e2b-it-qat
kind labels: precision 90%, recall 65%, F1 76%
trap vs no trap: 77% correct
time per document: 1.70 s
  auto_renew      P  92%  R  77%  (gold 43)
  trial_converts  P 100%  R  90%  (gold 10)
  lock_in         P   0%  R   0%  (gold 9)
  exit_fee        P  67%  R 100%  (gold 2)
  cancel_notice   P  75%  R  33%  (gold 9)
  no_refund       P  90%  R  68%  (gold 28)

## rules
kind labels: precision 63%, recall 91%, F1 75%
trap vs no trap: 65% correct
time per document: 0.00 s
  auto_renew      P  63%  R  93%  (gold 43)
  trial_converts  P 100%  R 100%  (gold 10)
  lock_in         P  54%  R  78%  (gold 9)
  exit_fee        P  29%  R 100%  (gold 2)
  cancel_notice   P  28%  R  56%  (gold 9)
  no_refund       P  85%  R 100%  (gold 28)

## gemma3:1b, calibrated (2-fold by service)
fold 1: threshold 0.97 -> precision 64%, recall 96%, F1 77%
fold 2: threshold 0.50 -> precision 64%, recall 87%, F1 74%
average on held-out services: precision 64%, recall 91%, F1 75%

## gemma4:e2b-it-qat, calibrated (2-fold by service)
fold 1: threshold 0.05 -> precision 68%, recall 96%, F1 80%
fold 2: threshold 0.23 -> precision 75%, recall 72%, F1 74%
average on held-out services: precision 72%, recall 84%, F1 77%

# ADR-0002: Checkbox detection — build, buy, or train

- Status: Accepted
- Date: 2026-08-27
- Supersedes nothing; extends ADR-0001 §3 (classical CV, not a trained model).

## Context

ADR-0001 section 3 committed to classical computer vision for the detector, and that
code now exists and works well on the four sample forms. Revisiting it after the
fact, I want to be honest that "hand-rolled OpenCV" is not the only reasonable
answer, and that the role this take-home is for (Staff *fullstack* — Go/React/TS,
"integrate AI services into the core SaaS platform", "architect for scale…
millions of documents", Lambda/SQS/S3) is read more for system judgement than for
CV depth. So the question is less "is my algorithm good" and more "did I pick the
right tool, and can I say why".

Three options were on the table.

### A. Classical CV, written here (what ADR-0001 chose)

`cv2.adaptiveThreshold` → `findContours` → shape/size filter → fill-ratio check.
~90 lines in `services/detector/detection.py`.

- **For:** no dependency to stand behind, no training data, deterministic, $0 per
  call, runs offline, every line explainable in the review.
- **Against:** thresholds are tuned to ~240–470 DPI scans and will need
  re-tuning for other layouts; no field labels; a lower accuracy ceiling on
  documents I have not seen. `boxdetect` (the PyPI package that does almost
  exactly this) was rejected in ADR-0001 §3 and is also unmaintained since 2023,
  pre-NumPy 2 — it would not even install cleanly against the pinned deps.

### B. Buy it — AWS Textract `AnalyzeDocument` (FORMS)

One `AnalyzeDocument` call returns `SELECTION_ELEMENT` blocks with a
`SelectionStatus` of `SELECTED` / `NOT_SELECTED` and a bounding box — i.e.
detection *and* classification, managed.

- **For:** ~30 lines of adapter code, AWS-native (exactly the "integrate an AI
  service" shape the JD describes), and almost certainly more accurate across
  unfamiliar layouts than my thresholds. Bounding boxes come back as ratios of
  page size, which is a trivial multiply to reach the pixel contract.
- **Against:** ~$0.05 per page (FORMS pricing, no free tier), an IAM permission
  and a network hop in the request path, and a hard dependency on a service the
  reviewer has to trust works. For a *coding* challenge, `client.analyze_document`
  is also thin to walk through.

### C. Train a model

Fine-tune an object detector (YOLO / DETR-style) for checkboxes.

- **Against:** needs labelled bounding boxes across many form layouts. The brief
  ships four images. Synthesising training data (pasting checkboxes onto real
  documents) is a known approach and a known risk — too much for a one-week
  window, for a capability the ML team at HomeVision owns anyway. Not pursued.

## Decision

Ship **both A and B behind the one `CheckboxDetector` interface** that already
exists in `apps/api/src/handler.ts`, and let a validated request field pick:

- `strategy=opencv` (default): the classical-CV Lambda. Free, offline,
  deterministic — the right default for a demo and for anyone who cannot take a
  per-page cost.
- `strategy=textract`: the Textract adapter. Opt-in, so cost is only incurred
  when someone asks for it.

The pure core stays pure — it receives both capabilities as an injected map and
selects by the validated field; all AWS wiring stays in the imperative shell
(`lambda.ts`), consistent with ADR-0001 §1.

## Consequences

- The submission demonstrates the build-vs-buy reasoning *and* the AWS
  integration, without betting the result on either one.
- Two code paths to keep working and two sets of behavior to document
  (`docs/detection-approach.md`).
- `strategy=textract` needs AWS credentials even in local dev (there is no local
  Textract); `strategy=opencv` stays fully offline. Documented.
- The recommended production default, once volume and accuracy needs are real, is
  Textract — with the classical path kept as a zero-cost fallback and for
  air-gapped processing. At millions of documents neither path runs synchronously
  behind API Gateway; the async design (S3 + SQS + a worker Lambda + polling) is
  described in `docs/detection-approach.md`, not built here.

# ADR-0002: Build, buy, or train the checkbox detector

- Status: Accepted
- Date: 2026-08-27

## Context

ADR-0001 section 3 committed to classical computer vision for the detector, and that code now exists and works well on the four sample forms. Coming back to it, I want to be honest that hand-rolled OpenCV isn't the only defensible answer, and that this take-home is for a Staff fullstack role: Go/React/TypeScript, "integrate AI services into the core SaaS platform", "architect for scale", Lambda/SQS/S3. That gets read more for system judgment than for computer-vision depth, so the real question isn't whether my algorithm is good, it's whether I picked the right tool and can say why.

## The three ways to do this

The path I'm on is the classical one from ADR-0001: adaptive threshold, find contours, filter by shape and size, then a fill-ratio check, about ninety lines in `services/detector/detection.py`. Its whole appeal is that it costs nothing to run, is deterministic, works offline, needs no training data, and there isn't a line in it I can't explain if asked. The price is that the pixel thresholds are tuned to roughly 240-470 DPI scans and would need re-tuning for a very different layout or scan resolution, and it produces no field labels. `boxdetect`, the PyPI package that does almost exactly this, I'd already ruled out in ADR-0001 section 3 for not wanting to stand behind a pipeline I didn't write, and it turns out to be unmaintained since 2023 and pre-NumPy 2, so it wouldn't install against the pinned versions anyway.

The second option is to buy it. AWS Textract's `AnalyzeDocument` with the FORMS and TABLES features returns a `SELECTION_ELEMENT` block for every checkbox, each with a `SELECTED`/`NOT_SELECTED` status and a bounding box. Detection and classification in one managed call, about thirty lines of adapter code. It's AWS-native, which is the exact shape of integration the job description talks about, and it needs no per-layout tuning. It is not more accurate on these four samples though: with both feature types it lands about level with the classical pipeline, and with FORMS alone it drops the checkboxes that sit inside table cells (which on an appraisal form is most of them). The bounding boxes come back as ratios of the page, which is a trivial multiply to reach the pixel contract. What it costs is about six and a half cents a page (FORMS plus TABLES, billed additively, no free tier), an IAM permission and a network hop in the request path, and a hard dependency on a service the reviewer has to trust works. And for a challenge that asks me to walk through my code, `client.analyze_document` is thin to walk through.

The third option is to train a model, fine-tuning an object detector for checkboxes. That needs labeled bounding boxes across many form layouts, and the brief ships four images. Synthesizing training data by pasting checkboxes onto real documents is a known approach and a known risk, and it's more than a one-week window should spend building a capability the ML team at HomeVision already owns. I didn't pursue it.

## Decision

Ship the first two behind the one `CheckboxDetector` interface that already exists in `apps/api/src/handler.ts`, and let a validated request field choose. `strategy=opencv` is the default: free, offline, and deterministic, which is the right choice for a demo and for anyone who can't take a per-page cost. `strategy=textract` is opt-in, so the cost only lands when someone asks for it. The core function stays free of AWS wiring (it's handed both detectors and picks by the validated field) and the client construction all stays in `lambda.ts`, consistent with ADR-0001 section 1.

## Where this leaves me

The submission shows the build-vs-buy reasoning and the AWS integration without betting the result on either one. The cost is two code paths to keep working and two sets of behavior to document. `strategy=textract` also needs real AWS credentials even in local dev, since there's no local Textract, whereas `strategy=opencv` stays fully offline. In production, once the volume and layout variety are real, I'd make Textract the default and keep the classical path as the zero-cost fallback and for anything that has to run air-gapped. At millions of documents neither path runs synchronously behind API Gateway; the async design is written up in `docs/detection-approach.md`, not built here.

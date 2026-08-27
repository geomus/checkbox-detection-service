# Checkbox detection: approach, trade-offs, limitations

This is the write-up the brief asks for. It covers what the service does, the two
detection strategies and when to use each, the known limitations of both, and how
this scales past a demo.

## What it does

`POST /detect` takes a multipart upload:

| field | required | notes |
|---|---|---|
| `file` | yes | the document image (JPEG or PNG) |
| `strategy` | no | `opencv` (default) or `textract` |
| `width`, `height` | only for `textract` | the image's pixel size |

and returns

```json
{ "boxes": [ { "bbox": [x1, y1, x2, y2], "is_checked": true }, ... ] }
```

`bbox` is the top-left and bottom-right pixel coordinates of each detected
checkbox. Per the brief, perfect accuracy is not expected.

The API is a functional core (`apps/api/src/handler.ts`) plus an imperative shell
(`lambda.ts`). Both strategies implement one `CheckboxDetector` interface; the
shell builds the two and injects them as a map, and the validated `strategy`
field picks which one runs. Adding a third strategy later is a new file plus one
map entry.

## Strategy 1 — classical computer vision (default)

A small OpenCV pipeline in `services/detector/` (Python Lambda). Grayscale →
adaptive threshold → find contours → keep the ones shaped like a small square
box → drop duplicate outlines → measure the ink inside each to call it
checked/unchecked. Full detail and the tuning constants are in
[`services/detector/README.md`](../services/detector/README.md).

- **Use it when:** you want zero per-call cost, deterministic output, or offline
  operation, and the documents look roughly like the samples (~200–500 DPI
  scans with printed box outlines).
- **Limits:** pixel-size thresholds are tuned to that DPI range and would need
  re-tuning elsewhere; boxes with no printed border are missed; a box crossed by
  a pen stroke or table rule can fail the shape filter; it produces no field
  labels.

## Strategy 2 — AWS Textract (`strategy=textract`)

One `AnalyzeDocument` call with `FeatureTypes: ['FORMS']`
(`apps/api/src/textract-client.ts`). Textract returns a `SELECTION_ELEMENT` block
for every checkbox/radio button with a `SelectionStatus` and a bounding box given
as ratios of the page; we scale those to pixels with the supplied `width`/`height`
and map `SELECTED` → `is_checked: true`.

- **Use it when:** the layout is unfamiliar and accuracy matters more than cost —
  Textract generalises far better than hand-tuned thresholds.
- **Limits:** ~$0.05 per page (FORMS, no free tier); needs the `textract:AnalyzeDocument`
  IAM grant and a network round-trip in the request path; there is no local
  emulation, so `strategy=textract` calls the real service even in local dev and
  needs AWS credentials; synchronous `AnalyzeDocument` handles single-page images
  only (PDF/multipage needs the async API — see Scale).

## Choosing between them

Full reasoning in [`docs/adr/0002-checkbox-detection-build-vs-buy.md`](adr/0002-checkbox-detection-build-vs-buy.md).
Short version: the default is `opencv` because it is free and needs nothing
external, which is right for a demo and for anyone who cannot take a per-page
cost. In production, once volume and accuracy needs are real, `textract` is the
better default, with the classical path kept as a zero-cost fallback and for
air-gapped processing. Training a bespoke model was rejected — there is no
labelled data for it and synthesising some is too much risk for this window.

## Scale

Neither strategy runs synchronously behind API Gateway at real volume:

- API Gateway HTTP APIs cap at a 29 s integration timeout.
- A synchronous Lambda-to-Lambda invoke caps the payload at 6 MB; a large scan
  base64-encodes close to that.
- Textract's synchronous `AnalyzeDocument` is single-page; multi-page PDFs need
  `StartDocumentAnalysis` + `GetDocumentAnalysis`, which are async by design.

The async design (not built here, flagged as the next step): `POST /detect`
stores the upload in S3 and enqueues an SQS message with the object key and
chosen strategy, then returns a job id. A worker Lambda consumes the queue, runs
the detector, and writes the result (S3 or DynamoDB). The client polls
`GET /detect/{id}` or receives a push. This is the standard S3 + SQS + worker
shape and keeps the public endpoint fast and failure-isolated.

## Trying it

```bash
yarn dev   # API on :3000, opencv detector shim on :8000

# default (opencv, offline)
curl -F file=@docs/challenge/sample-images/document-1.jpg \
  http://localhost:3000/detect

# textract (needs AWS credentials; pass the image's pixel size)
curl -F file=@docs/challenge/sample-images/document-2.jpg \
  -F strategy=textract -F width=1586 -F height=846 \
  http://localhost:3000/detect
```

`services/detector/.venv/bin/python scripts/visualize_detections.py` renders the
opencv strategy's output onto the sample forms for a visual check.

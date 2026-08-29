# Checkbox detection: approach, trade-offs, limitations

The write-up the brief asks for: what the service does, the two detection
strategies and when to reach for each, what each one can't do, and how this
scales past a demo.

## What it does

`POST /detect` takes a multipart upload. The `file` field is the document image
(JPEG or PNG). An optional `strategy` field selects the detector: `opencv` (the
default) or `textract`. When `strategy` is `textract`, the request must also
carry the image's pixel `width` and `height`, because Textract returns
coordinates as ratios of the page and the response needs pixels.

The response is the contract from the brief:

```json
{ "boxes": [ { "bbox": [x1, y1, x2, y2], "is_checked": true }, ... ] }
```

`bbox` is the top-left and bottom-right pixel coordinates of each detected
checkbox. Perfect accuracy isn't expected. A box from `strategy=textract` may
also carry a `label` string (the form field it belongs to); see that section.

The API is a pure core (`apps/api/src/handler.ts`) that validates the request
with Zod and calls whichever detector it was handed, plus an imperative shell
(`lambda.ts`) that builds the AWS clients. See ADR-0001 section 1.

## The classical-CV strategy (default)

A small OpenCV pipeline in `services/detector/`: grayscale, adaptive threshold,
find contours, keep the ones shaped like a small square box, drop duplicate
outlines, then measure the ink inside each to call it checked or unchecked. The
full detail and the tuning constants are in
[`services/detector/README.md`](../services/detector/README.md).

Reach for this when you want zero per-call cost, deterministic output, or offline
operation, and the documents look roughly like the samples: 200-500 DPI scans
with printed box outlines. It won't find boxes drawn without a printed border, a
box crossed by a long pen stroke or table rule can slip past the shape filter,
the pixel thresholds are tuned to that DPI range, and it produces no field
labels.

## The Textract strategy (`strategy=textract`)

One `AnalyzeDocument` call with `FeatureTypes: ['FORMS', 'TABLES']`
(`apps/api/src/textract-client.ts`). Textract returns a `SELECTION_ELEMENT` block
for every checkbox with a `SelectionStatus` and a page-ratio bounding box; the
adapter scales those to pixels with the supplied `width`/`height` and maps
`SELECTED` to `is_checked`. TABLES is in the request because Textract only returns
the selection elements it finds inside table cells when tables are asked for, and
on an appraisal form most checkboxes are in tables - with `FORMS` alone it drops
them.

The FORMS output also links most checkboxes to their printed label through a
key/value graph, so the adapter attaches an optional `label` ("Owner", "Fee
Simple") to each box it can resolve. On the two sample forms I checked that
covers about 90-95% of the checkboxes; the rest are table cells with no
associated key and come back without a label. The classical strategy has no text
stage, so it never sets `label`.

Reach for this when the layouts vary and re-tuning the CV thresholds per template
is not viable: Textract needs no per-layout tuning. It is not more accurate on
these four samples - with both feature types it lands about level with the
classical pipeline. It costs about six and a half cents a page (FORMS $0.05 plus
TABLES $0.015, billed additively, no free tier), needs the
`textract:AnalyzeDocument` IAM grant and a network round-trip, and has no local
emulation, so `strategy=textract` calls the real service even in local dev and
needs AWS credentials. Synchronous `AnalyzeDocument` handles single-page images
only; multi-page PDFs need the asynchronous API (see Scale).

Because it's the only path that costs money, it has a kill switch: set the
`TEXTRACT_ENABLED` env var on the api Lambda to `false` (straight from the console,
no redeploy - new invocations pick it up within about a minute) and the API drops
the strategy from its detector map and answers `strategy=textract` with `503`, no
AWS call. It defaults to `true`, and a plain `serverless deploy` re-applies that
default over a console override; to keep it off through a deploy, run
`TEXTRACT_ENABLED=false yarn deploy`.

## Choosing between them

The default is `opencv` because it's free and self-contained, which suits a demo.
In production I'd flip that once volume and layout variety justify the spend,
keeping the classical path as the zero-cost fallback. The full build-vs-buy reasoning,
including why not a trained model, is in
[`docs/adr/0002-checkbox-detection-build-vs-buy.md`](adr/0002-checkbox-detection-build-vs-buy.md).

## Scale

Neither strategy runs synchronously behind API Gateway at real volume. API
Gateway HTTP APIs cap at a 29-second integration timeout; a synchronous
Lambda-to-Lambda invoke caps the payload at 6 MB, which a large scan approaches
once base64-encoded; and Textract's synchronous call is single-page, so
multi-page PDFs need `StartDocumentAnalysis` / `GetDocumentAnalysis`, which are
asynchronous by design.

The shape that does hold: `POST /detect` stores the upload in S3 and puts the
object key plus the chosen strategy on an SQS queue, then returns a job id. A
worker Lambda drains the queue, runs the detector, and writes the result to S3 or
DynamoDB. The client polls `GET /detect/{id}` or gets a push. This keeps the
public endpoint fast and isolates it from a slow or failing detector. Not built
here.

Repeat documents: `apps/api/src/cache.ts` memoizes results by the `sha256` of the
uploaded image plus `width x height`, per strategy, in a `Map` in the Lambda's
module scope. That dedupes re-uploads within a warm instance for free but resets
on every cold start and is not shared across instances. A cross-instance cache
would be DynamoDB with a TTL, keyed the same way - worth it once the same
documents are seen often enough to matter, not before.

## Trying it

```bash
yarn dev   # API on :3000, opencv detector shim on :8000

# default (opencv, offline)
curl -F file=@docs/challenge/sample-images/document-1.jpg http://localhost:3000/detect

# textract (needs AWS credentials; pass the image's pixel size)
curl -F file=@docs/challenge/sample-images/document-2.jpg \
  -F strategy=textract -F width=1586 -F height=846 \
  http://localhost:3000/detect
```

`services/detector/.venv/bin/python scripts/visualize_detections.py` renders the
classical strategy's output onto the sample forms for a visual check.

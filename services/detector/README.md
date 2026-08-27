# Detector service - approach, trade-offs, limitations

Classical computer vision that finds every checkbox in a scanned appraisal form
and marks each one checked or unchecked. No machine learning, no training data.

## Contract

Invoked as an AWS Lambda (container image) by the API service. `handler.py` is
the only part that touches the outside world; `detection.py` is a pure function.

- Input event: `{ "imageBase64": str }`
- Output: `{ "boxes": [ { "bbox": [x1, y1, x2, y2], "is_checked": bool }, ... ] }`

`bbox` is the top-left and bottom-right pixel coordinates in the original image.

## How it works

`detect_checkboxes(image_bytes)` runs four steps (`detection.py`):

1. **Grayscale decode** - `cv2.imdecode(..., IMREAD_GRAYSCALE)`. The image is
   processed at native resolution so coordinates need no rescaling.
2. **Adaptive threshold** - `cv2.adaptiveThreshold` with a local mean. A local
   cutoff (rather than one global value) keeps an unevenly-lit or grey scan
   clean. Result: a black/white image with ink as white.
3. **Contour shape filter** - `cv2.findContours`, then for each contour:
   `approxPolyDP` must collapse it to 4 convex corners; the bounding box must be
   roughly square and within a pixel-size range; and the outline must fill most
   of its own bounding rectangle (rejects arcs, letters, stray pen marks).
4. **Deduplicate** - a drawn square produces an inner and an outer contour, and
   table cells share borders, so any box whose center sits inside a larger kept
   box is dropped.

**Classification** (`_is_filled`): crop the box interior, trim ~18% off each
edge to exclude the border strokes, and measure the fraction of ink pixels. Above
`FILL_RATIO_THRESHOLD` (0.12) it is checked. An X or a tick covers well above
that; an empty box is near zero.

## Trade-offs

- **Classical CV, not a model.** Every line is explainable in a review and needs
  no training data. The cost is a lower accuracy ceiling on layouts we have not
  seen. See `docs/adr/0001-initial-architecture-decisions.md` section 3. The
  brief states perfect accuracy is not expected.
- **Reimplemented, not `boxdetect`.** The PyPI `boxdetect` package does almost
  this exact pipeline, but depending on it would mean standing behind code we did
  not write. It is ~100 lines to do ourselves.
- **Pixel-size thresholds are DPI-dependent.** The four samples run ~240-470 DPI,
  where a checkbox is ~30-75 px. `MIN/MAX_BOX_SIDE_PX` (12-90) covers that with
  margin, at the cost of some false positives from small table cells or capital
  letters. Reading DPI from the file metadata was rejected - scans often report a
  wrong value. `TODO` in `detection.py`: make the thresholds request parameters.
- **Native-resolution processing** is simple and fast enough here (largest
  sample ~10 MP). A much larger image would want downscaling plus coordinate
  rescaling.

## Known limitations

- Checkboxes with no printed border (underline-only or shaded-cell fields) are
  missed - step 3 needs a 4-sided outline.
- A box crossed by a long pen stroke or table rule can fail the shape filter.
- Fill ratio does not tell a deliberate mark from a smudge or bleed-through; a
  very lightly dotted box near the 0.12 threshold can go either way.
- Radio buttons (circles) are intentionally not detected.
- No field labels - the response says where each box is and whether it is
  filled, not which question it answers (see below).

## What production would add

- **Field labels**, behind an opt-in flag: OCR the text beside each box and pair
  it spatially. Options, cheapest first - Tesseract in this container ($0),
  Textract `DetectDocumentText` (~$1.50 / 1000 pages), or Textract
  `AnalyzeDocument` FORMS (~$50 / 1000 pages, which returns labels and selection
  state directly).
- Configurable detection thresholds once there is real usage data.
- PDF input (many appraisal documents arrive as PDF).
- Async processing (S3 + SQS + polling) if images or traffic outgrow a
  synchronous Lambda invoke.

## Running it

```bash
cd services/detector
python -m venv .venv
.venv/bin/pip install -r requirements-dev.txt

.venv/bin/python -m pytest                       # unit + sample-image tests
```

From the repo root, `yarn test:detector` runs the same suite, and
`services/detector/.venv/bin/python scripts/visualize_detections.py` renders the
detections onto the sample forms in `./detection-preview/` for a visual check.

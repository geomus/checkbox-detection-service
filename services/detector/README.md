# Detector service - the classical-CV strategy

Classical computer vision that finds every checkbox in a scanned appraisal form
and marks each one checked or unchecked. No machine learning, no training data.

This is one of two detection strategies (the default one). For the overview, the
Textract strategy, the build-vs-buy reasoning and the scale path, see
[`docs/detection-approach.md`](../../docs/detection-approach.md) and
[`docs/adr/0002`](../../docs/adr/0002-checkbox-detection-build-vs-buy.md). This
file is the implementation detail for the OpenCV pipeline only.

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

## Limitations

- Pixel-size thresholds are DPI-dependent: `MIN/MAX_BOX_SIDE_PX` (12-90) fits the
  ~240-470 DPI samples, at the cost of some false positives from small table
  cells or capital letters. `TODO` in `detection.py`: make them request params.
- The image is processed at native resolution (largest sample ~10 MP). A much
  larger image would want downscaling plus coordinate rescaling.
- Checkboxes drawn without a printed border are missed - step 3 needs a 4-sided
  outline. A box crossed by a long pen stroke or table rule can fail it too.
- Fill ratio can't tell a deliberate mark from a smudge or bleed-through; a box
  near the 0.12 threshold can go either way.
- Radio buttons (circles) are intentionally not detected, and there are no field
  labels (see the `TODO` in `detection.py`).

Why classical CV over Textract or a trained model, and configurable thresholds /
PDF / async, are in
[`docs/detection-approach.md`](../../docs/detection-approach.md) and
[`docs/adr/0002`](../../docs/adr/0002-checkbox-detection-build-vs-buy.md).

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

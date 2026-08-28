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
- Output: the `{ "boxes": [...] }` contract from the repo root README.

## How it works

This is the standard OpenCV recipe for the problem (contour detection plus a
fill-ratio check), as laid out in FuzzyLabs'
[Checkbox Detection with OpenCV](https://www.fuzzylabs.ai/blog-post/checkbox-detection-with-opencv)
and the [OpenCV contour tutorial](https://learnopencv.com/contour-detection-using-opencv-python-c/).

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

**Classification** (`_classify`): crop the box interior, trim ~18% off each
edge to exclude the border strokes, and measure the fraction of ink pixels. Above
`FILL_RATIO_THRESHOLD` (0.12) it is checked. An X or a tick covers well above
that; an empty box is near zero.

## Limitations

- Pixel-size thresholds are DPI-dependent: `MIN/MAX_BOX_SIDE_PX` (12-90) fits the
  ~240-470 DPI samples, at the cost of some false positives from small table
  cells or capital letters.
- The image is processed at native resolution (largest sample ~10 MP). A much
  larger image would want downscaling plus coordinate rescaling.
- Checkboxes drawn without a printed border are missed - step 3 needs a 4-sided
  outline, and a box crossed by a long hand stroke (e.g. the struck-out "No
  Zoning" on `document-2`) loses that closed contour.
- A box whose outline and mark are both erased (e.g. Electricity "Public" on
  `document-2`) falls below what outline detection can catch without hurting
  precision elsewhere.
- Fill ratio can't tell a deliberate mark from a smudge or bleed-through; a box
  near the 0.12 threshold can go either way.
- Radio buttons (circles) are intentionally not detected, and there are no field
  labels.

## Running it

Set up the venv per the repo root README, then:

```bash
.venv/bin/python -m pytest
```

`yarn test:detector` from the repo root runs the same suite. Also from the repo
root, `services/detector/.venv/bin/python scripts/visualize_detections.py` renders
the detections onto the sample forms in `detection-preview/` for a visual check.

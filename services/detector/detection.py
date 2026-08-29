"""Checkbox detection for scanned appraisal documents.

Pure computer-vision core: it takes the raw bytes of an image and returns the
bounding box of every checkbox-like square it finds. No AWS, no file or network
I/O, no environment lookups. ``handler.py`` is the only place that talks to the
outside world.

The pipeline is the standard OpenCV recipe for this (contour detection plus a
fill-ratio check):

  1. decode the image to grayscale
  2. threshold to black/white with a local (adaptive) cutoff
  3. find contours, keep the ones shaped like a small, roughly square box
  4. drop duplicates (a drawn square gives an inner and an outer contour)
  5. sort the survivors into reading order (top-to-bottom, left-to-right)

``README.md`` in this folder has the references, the reasoning and the known
limitations.
"""

import cv2
import numpy as np

# --- Tuning constants --------------------------------------------------------
# These are pixel sizes, so they depend on the scan resolution. The four sample
# forms run roughly 240-470 DPI, where a real checkbox is about 30-75 px across.
# The range below is deliberately wide to cover all of them; the cost is some
# false positives from small table cells or capital letters.
# TODO: expose these as optional request parameters (keeping these values as the
# defaults) once there is real usage data to tune them against.
MIN_BOX_SIDE_PX = 12
MAX_BOX_SIDE_PX = 90

# Boxes on one form row can sit a few px apart vertically on a skewed scan. I
# quantize the top edge into bands this tall before ordering left-to-right, so a
# row reads in order instead of by its exact y. 24 px is wide enough to swallow
# that jitter, narrower than the gap between rows on the sample forms.
ROW_BAND_PX = 24

# How far the width/height ratio may stray from a perfect square (1.0). 0.35
# keeps anything between roughly 3:4 and 4:3.
ASPECT_TOLERANCE = 0.35

# A real box outline fills most of its own bounding rectangle. Arcs, letters and
# stray ink usually do not, so this rejects a lot of noise.
MIN_RECT_FILL = 0.80

# Share of the box interior that must be ink for it to count as checked. A drawn
# X or tick covers well above this; a clean empty box is close to zero.
FILL_RATIO_THRESHOLD = 0.12

# Fraction trimmed off each side before measuring the fill, so the box's own
# border strokes are not counted as if they were a mark.
BORDER_INSET_RATIO = 0.18

# (x, y, width, height), the shape returned by cv2.boundingRect.
Rect = tuple[int, int, int, int]


def detect_checkboxes(image_bytes: bytes) -> list[dict]:
    """Find every checkbox-like square in an image.

    Returns a list of ``{"bbox": [x1, y1, x2, y2], "is_checked": bool,
    "confidence": float}`` dicts with coordinates in the original image's pixel
    space.
    """
    gray = _load_grayscale(image_bytes)
    binary = _binarize(gray)
    candidates = _find_square_candidates(binary)
    boxes = _reading_order(_deduplicate(candidates))

    # TODO: this reports box location + fill, not the field label ("Owner", ...).
    # That needs OCR + a spatial pairing heuristic; see docs/detection-approach.md.
    results = []
    for x, y, w, h in boxes:
        is_checked, confidence = _classify(binary, (x, y, w, h))
        results.append(
            {"bbox": [x, y, x + w, y + h], "is_checked": is_checked, "confidence": confidence}
        )
    return results


def _load_grayscale(image_bytes: bytes) -> np.ndarray:
    """Decode raw bytes to a grayscale array. cv2.imdecode reports "not an image"
    by returning None instead of raising, so this is where bad input becomes a
    ValueError."""
    buffer = np.frombuffer(image_bytes, dtype=np.uint8)
    gray = cv2.imdecode(buffer, cv2.IMREAD_GRAYSCALE)
    if gray is None:
        raise ValueError("image bytes could not be decoded")
    return gray


def _binarize(gray: np.ndarray) -> np.ndarray:
    """Threshold to black/white. findContours traces white shapes on black, so the
    inverted output puts ink at 255 and paper at 0."""
    # adaptiveThreshold takes an odd window size in px and a constant subtracted
    # from each window's mean. blockSize=15 is about one checkbox side at the
    # sample DPI, so the local mean is taken over roughly a box's worth of pixels;
    # C=7 lifts the cutoff just above the window mean so faint scanner speckle
    # stays background. A local cutoff (not one global value) handles uneven scans.
    return cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, blockSize=15, C=7
    )


def _find_square_candidates(binary: np.ndarray) -> list[Rect]:
    """Bounding rects of every contour shaped like a small square."""
    # RETR_LIST: every contour as a flat list; I filter by shape, not by nesting.
    contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    return [cv2.boundingRect(c) for c in contours if _looks_like_box(c)]


def _looks_like_box(contour: np.ndarray) -> bool:
    """True when the contour is a closed, convex, 4-cornered outline that is
    roughly square and within checkbox pixel-size range."""
    # Blind to a box merged with hand ink (cross-outs) or with its printed
    # outline erased. See the Limitations section in README.md.
    perimeter = cv2.arcLength(contour, closed=True)
    # approxPolyDP's epsilon is the largest gap allowed between the real outline
    # and the simplified one, here 2% of the perimeter: loose enough to collapse a
    # slightly wavy printed border to 4 corners, tight enough to keep a real corner.
    corners = cv2.approxPolyDP(contour, 0.02 * perimeter, closed=True)
    if len(corners) != 4 or not cv2.isContourConvex(corners):
        return False

    _, _, w, h = cv2.boundingRect(corners)
    if not (MIN_BOX_SIDE_PX <= w <= MAX_BOX_SIDE_PX):
        return False
    if not (MIN_BOX_SIDE_PX <= h <= MAX_BOX_SIDE_PX):
        return False
    if abs(w / h - 1.0) > ASPECT_TOLERANCE:
        return False

    rect_fill = cv2.contourArea(corners) / float(w * h)
    return rect_fill >= MIN_RECT_FILL


def _deduplicate(rects: list[Rect]) -> list[Rect]:
    """Drop rects whose center sits inside a larger rect I already kept.

    A drawn square has two contours (inside and outside of the line), and boxes
    packed into a table share borders. Keeping the largest of each cluster is
    enough here; the list per document is short, so the nested loop is fine.
    """
    largest_first = sorted(rects, key=lambda r: r[2] * r[3], reverse=True)

    kept: list[Rect] = []
    for x, y, w, h in largest_first:
        center_x, center_y = x + w / 2, y + h / 2
        inside_existing = any(
            kx <= center_x <= kx + kw and ky <= center_y <= ky + kh
            for (kx, ky, kw, kh) in kept
        )
        if not inside_existing:
            kept.append((x, y, w, h))
    return kept


def _reading_order(rects: list[Rect]) -> list[Rect]:
    """Sort by row band (see ROW_BAND_PX), then x, so a skewed row still reads left
    to right instead of by exact y."""
    return sorted(rects, key=lambda r: (r[1] // ROW_BAND_PX, r[0]))


def _classify(binary: np.ndarray, rect: Rect) -> tuple[bool, float]:
    """Reuse the binary image from detection (ink = white) to measure the box's fill.

    Returns (is_checked, confidence). The confidence is not a probability: it is
    how far the interior ink fraction sits from the checked/unchecked cutoff,
    clamped to 1. A clean empty box or a bold mark lands near 1; a box right at
    the cutoff lands near 0.
    """
    x, y, w, h = rect
    inset_x = round(w * BORDER_INSET_RATIO)
    inset_y = round(h * BORDER_INSET_RATIO)
    inner = binary[y + inset_y : y + h - inset_y, x + inset_x : x + w - inset_x]

    fill_ratio = np.count_nonzero(inner) / inner.size
    confidence = min(abs(fill_ratio - FILL_RATIO_THRESHOLD) / FILL_RATIO_THRESHOLD, 1.0)
    # plain Python bool/float: numpy scalars are not JSON-serializable in the handler.
    return bool(fill_ratio > FILL_RATIO_THRESHOLD), round(float(confidence), 3)

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

    Returns a list of ``{"bbox": [x1, y1, x2, y2], "is_checked": bool}`` dicts
    with coordinates in the original image's pixel space.
    """
    gray = _load_grayscale(image_bytes)
    binary = _binarize(gray)
    candidates = _find_square_candidates(binary)
    boxes = _deduplicate(candidates)

    # TODO: this reports box location + fill, not the field label ("Owner", ...).
    # That needs OCR + a spatial pairing heuristic; see docs/detection-approach.md.
    return [
        {"bbox": [x, y, x + w, y + h], "is_checked": _is_filled(binary, (x, y, w, h))}
        for (x, y, w, h) in boxes
    ]


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
    """Convert gray -> black/white with ink as white (255) on black (0)."""
    # adaptiveThreshold args: the window size in px (must be odd) and a constant
    # subtracted from each window's mean. A local cutoff handles uneven lighting.
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
    # approxPolyDP simplifies the outline; a clean rectangle collapses to 4 points.
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


def _is_filled(binary: np.ndarray, rect: Rect) -> bool:
    """Reuse the binary image from detection (ink = white) to measure the box's fill."""
    x, y, w, h = rect
    inset_x = round(w * BORDER_INSET_RATIO)
    inset_y = round(h * BORDER_INSET_RATIO)
    inner = binary[y + inset_y : y + h - inset_y, x + inset_x : x + w - inset_x]

    fill_ratio = np.count_nonzero(inner) / inner.size
    # bool() so the result is a plain Python bool, not numpy.bool_, which
    # json.dumps in the handler cannot serialize.
    return bool(fill_ratio > FILL_RATIO_THRESHOLD)

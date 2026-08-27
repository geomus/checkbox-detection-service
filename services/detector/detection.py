"""Checkbox detection for scanned appraisal documents.

Pure computer-vision core: it takes the raw bytes of an image and returns the
bounding box of every checkbox-like square it finds. No AWS, no file or network
I/O, no environment lookups. ``handler.py`` is the only place that talks to the
outside world.

Approach (classical CV, no machine learning):
  1. decode the image to grayscale
  2. turn it into black/white with a local (adaptive) threshold
  3. find contours and keep the ones shaped like a small, roughly square box
  4. drop duplicates (a drawn square produces an inner and an outer contour)

See ``README.md`` in this folder for the reasoning and known limitations.
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

# A real box outline fills most of its own bounding rectangle. Arcs, stray ink
# and handwriting usually do not, so this rejects a lot of noise.
MIN_RECT_FILL = 0.80

# Adaptive-threshold parameters. Block size is the neighbourhood (in px) used to
# pick a local cutoff and must be odd; C is subtracted from that local mean, so
# a higher C marks fewer pixels as ink.
_ADAPTIVE_BLOCK_SIZE = 15
_ADAPTIVE_C = 7

# (x, y, width, height), the shape returned by cv2.boundingRect.
Rect = tuple[int, int, int, int]


def detect_checkboxes(image_bytes: bytes) -> list[dict]:
    """Find every checkbox-like square in an image.

    Returns a list of ``{"bbox": [x1, y1, x2, y2], "is_checked": bool}`` dicts
    with coordinates in the original image's pixel space. Classification is
    added in the next commit, so ``is_checked`` is always ``False`` for now.
    """
    gray = _load_grayscale(image_bytes)
    binary = _binarize(gray)
    candidates = _find_square_candidates(binary)
    boxes = _deduplicate(candidates)

    # TODO: the response gives the box location and (next commit) whether it is
    # filled, but not which field it belongs to ("Owner", "Fee Simple", ...).
    # That needs OCR of the nearby text plus a spatial pairing heuristic.
    # Options, cheapest first: Tesseract bundled in this container ($0), Textract
    # DetectDocumentText (~$1.50 / 1000 pages), or Textract AnalyzeDocument FORMS
    # (~$50 / 1000 pages, which returns labels and selection state directly).
    # Would ship behind an opt-in flag so the base response and cost are unchanged.
    return [{"bbox": [x, y, x + w, y + h], "is_checked": False} for (x, y, w, h) in boxes]


def _load_grayscale(image_bytes: bytes) -> np.ndarray:
    """Decode raw image bytes (PNG/JPEG/...) into a single-channel gray image."""
    buffer = np.frombuffer(image_bytes, dtype=np.uint8)
    gray = cv2.imdecode(buffer, cv2.IMREAD_GRAYSCALE)
    if gray is None:
        raise ValueError("image bytes could not be decoded")
    return gray


def _binarize(gray: np.ndarray) -> np.ndarray:
    """Convert gray -> black/white with ink as white (255) on black (0).

    An adaptive threshold uses a local cutoff per neighbourhood instead of one
    global value, so a scan that is darker in one corner still comes out clean.
    """
    return cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_MEAN_C,
        cv2.THRESH_BINARY_INV,
        blockSize=_ADAPTIVE_BLOCK_SIZE,
        C=_ADAPTIVE_C,
    )


def _find_square_candidates(binary: np.ndarray) -> list[Rect]:
    """Bounding rects of every contour shaped like a small square."""
    # RETR_LIST: every contour as a flat list; I filter by shape, not by nesting.
    contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    return [cv2.boundingRect(c) for c in contours if _looks_like_box(c)]


def _looks_like_box(contour: np.ndarray) -> bool:
    """True when one contour has the shape of a checkbox outline."""
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

"""Tests for the checkbox detector.

Two layers:
  - synthetic tests draw a known box on a blank canvas, so detection and
    classification are checked against an exact, deterministic answer;
  - sample tests run the detector on the four real appraisal scans and assert
    against docs/challenge/sample-images/expected.json (a conservative box-count
    floor plus a handful of hand-verified anchor checkboxes).

No AWS, no network. This exercises the pure function directly.
"""

import json
from pathlib import Path

import cv2
import numpy as np
import pytest

from detection import MAX_BOX_SIDE_PX, MIN_BOX_SIDE_PX, detect_checkboxes

SAMPLE_DIR = Path(__file__).resolve().parents[3] / "docs" / "challenge" / "sample-images"
EXPECTED = json.loads((SAMPLE_DIR / "expected.json").read_text())
SAMPLE_NAMES = [name for name in EXPECTED if not name.startswith("_")]


def _png_bytes(image: np.ndarray) -> bytes:
    ok, buffer = cv2.imencode(".png", image)
    assert ok
    return buffer.tobytes()


def _blank_canvas() -> np.ndarray:
    return np.full((240, 320), 255, dtype=np.uint8)


def _iou(a: list[int], b: list[int]) -> float:
    """Intersection-over-union of two [x1, y1, x2, y2] boxes."""
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    overlap = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    if overlap == 0:
        return 0.0
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    return overlap / (area_a + area_b - overlap)


# --- Synthetic tests ------------------------------------------------------------


def test_detects_a_single_empty_checkbox():
    image = _blank_canvas()
    cv2.rectangle(image, (60, 60), (100, 100), 0, 2)

    boxes = detect_checkboxes(_png_bytes(image))

    assert len(boxes) == 1
    assert boxes[0]["is_checked"] is False
    assert _iou(boxes[0]["bbox"], [60, 60, 100, 100]) > 0.5
    # a clean empty box sits far from the fill cutoff, so the heuristic clamps to 1.0
    assert boxes[0]["confidence"] == 1.0


def test_detects_a_single_filled_checkbox():
    image = _blank_canvas()
    cv2.rectangle(image, (60, 60), (100, 100), 0, 2)
    cv2.line(image, (60, 60), (100, 100), 0, 3)
    cv2.line(image, (100, 60), (60, 100), 0, 3)

    boxes = detect_checkboxes(_png_bytes(image))

    assert len(boxes) == 1
    assert boxes[0]["is_checked"] is True


def test_ignores_a_circle():
    image = _blank_canvas()
    cv2.circle(image, (160, 120), 20, 0, 2)

    assert detect_checkboxes(_png_bytes(image)) == []


def test_ignores_a_box_larger_than_a_checkbox():
    image = _blank_canvas()
    oversized = MAX_BOX_SIDE_PX + 40
    cv2.rectangle(image, (40, 40), (40 + oversized, 40 + oversized), 0, 2)

    assert detect_checkboxes(_png_bytes(image)) == []


def test_returns_boxes_in_reading_order():
    image = _blank_canvas()
    corners = [(60, 40), (200, 40), (60, 160), (200, 160)]
    # Draw them out of reading order, so passing through detection order would fail.
    for x, y in (corners[3], corners[1], corners[2], corners[0]):
        cv2.rectangle(image, (x, y), (x + 40, y + 40), 0, 2)

    boxes = detect_checkboxes(_png_bytes(image))

    assert len(boxes) == 4
    detected = [tuple(box["bbox"][:2]) for box in boxes]
    for (got_x, got_y), (want_x, want_y) in zip(detected, corners):
        assert abs(got_x - want_x) <= 2 and abs(got_y - want_y) <= 2


# --- Sample-image tests -------------------------------------------------------


@pytest.fixture(scope="module")
def detections() -> dict[str, list[dict]]:
    return {name: detect_checkboxes((SAMPLE_DIR / name).read_bytes()) for name in SAMPLE_NAMES}


@pytest.mark.parametrize("name", SAMPLE_NAMES)
def test_finds_at_least_the_expected_number_of_boxes(name, detections):
    assert len(detections[name]) >= EXPECTED[name]["min_boxes_detected"]


@pytest.mark.parametrize("name", SAMPLE_NAMES)
def test_every_bbox_is_well_formed(name, detections):
    image = cv2.imread(str(SAMPLE_DIR / name))
    height, width = image.shape[:2]

    for box in detections[name]:
        x1, y1, x2, y2 = box["bbox"]
        assert 0 <= x1 < x2 <= width
        assert 0 <= y1 < y2 <= height
        side = max(x2 - x1, y2 - y1)
        assert MIN_BOX_SIDE_PX <= side <= MAX_BOX_SIDE_PX
        assert isinstance(box["is_checked"], bool)
        assert isinstance(box["confidence"], float)
        assert 0.0 <= box["confidence"] <= 1.0


@pytest.mark.parametrize("name", SAMPLE_NAMES)
def test_known_checkboxes_are_found_and_classified(name, detections):
    found = detections[name]

    for anchor in EXPECTED[name]["anchors"]:
        match = next((b for b in found if _iou(b["bbox"], anchor["bbox"]) > 0.3), None)
        assert match is not None, f"{name}: no detected box near {anchor['label']}"
        assert match["is_checked"] == anchor["is_checked"], (
            f"{name}: {anchor['label']} classified wrong"
        )

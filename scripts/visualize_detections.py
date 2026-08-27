"""Render the detector's output on the sample forms for a visual sanity check.

Run from the repo root:

    services/detector/.venv/bin/python scripts/visualize_detections.py

Writes one image per sample to ./detection-preview/ (git-ignored) with every
detected checkbox outlined (red for checked, green for unchecked) and a count
printed per file. Handy when tuning the thresholds in detection.py or picking
anchor coordinates for expected.json.
"""

import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "detector"))

from detection import detect_checkboxes  # noqa: E402  (needs the path insert above)

SAMPLE_DIR = ROOT / "docs" / "challenge" / "sample-images"
OUTPUT_DIR = ROOT / "detection-preview"

CHECKED_COLOR = (0, 0, 255)
UNCHECKED_COLOR = (0, 170, 0)


def main() -> None:
    OUTPUT_DIR.mkdir(exist_ok=True)

    for image_path in sorted(SAMPLE_DIR.glob("*.jpg")):
        boxes = detect_checkboxes(image_path.read_bytes())
        canvas = cv2.imdecode(np.fromfile(image_path, dtype=np.uint8), cv2.IMREAD_COLOR)

        for box in boxes:
            x1, y1, x2, y2 = box["bbox"]
            color = CHECKED_COLOR if box["is_checked"] else UNCHECKED_COLOR
            cv2.rectangle(canvas, (x1, y1), (x2, y2), color, 3)

        out_path = OUTPUT_DIR / f"{image_path.stem}.png"
        cv2.imwrite(str(out_path), canvas)

        checked = sum(box["is_checked"] for box in boxes)
        print(f"{image_path.name}: {len(boxes)} boxes ({checked} checked) -> {out_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

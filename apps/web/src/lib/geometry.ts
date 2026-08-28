import type { DetectedBox } from '@/lib/api';

// The API's bbox is [x1, y1, x2, y2] pixel corners; the SVG overlay wants an origin and a size.
export const boxToRect = ([x1, y1, x2, y2]: DetectedBox['bbox']) => ({
  x: x1,
  y: y1,
  width: x2 - x1,
  height: y2 - y1
});

export const summarize = (boxes: DetectedBox[]) => {
  const checked = boxes.filter((box) => box.is_checked).length;
  return { total: boxes.length, checked, unchecked: boxes.length - checked };
};

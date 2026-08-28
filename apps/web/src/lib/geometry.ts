import type { DetectedBox } from '@/lib/api'

export type Rect = { x: number; y: number; width: number; height: number }

// The API's bbox is [x1, y1, x2, y2] pixel corners; the SVG overlay wants an origin and a size.
export const boxToRect = ([x1, y1, x2, y2]: DetectedBox['bbox']): Rect => ({
  x: x1,
  y: y1,
  width: x2 - x1,
  height: y2 - y1,
})

export const summarize = (boxes: DetectedBox[]) => {
  const checked = boxes.filter((box) => box.is_checked).length
  return { total: boxes.length, checked, unchecked: boxes.length - checked }
}

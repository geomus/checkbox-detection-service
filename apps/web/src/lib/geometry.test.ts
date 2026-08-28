import { boxToRect, summarize } from '@/lib/geometry'
import type { DetectedBox } from '@/lib/api'

describe('boxToRect', () => {
  it('converts two corners to an origin and size', () => {
    expect(boxToRect([10, 20, 30, 50])).toEqual({ x: 10, y: 20, width: 20, height: 30 })
  })
})

describe('summarize', () => {
  it('counts checked and unchecked boxes', () => {
    const boxes: DetectedBox[] = [
      { bbox: [0, 0, 1, 1], is_checked: true },
      { bbox: [0, 0, 1, 1], is_checked: false },
      { bbox: [0, 0, 1, 1], is_checked: true },
    ]
    expect(summarize(boxes)).toEqual({ total: 3, checked: 2, unchecked: 1 })
  })
})

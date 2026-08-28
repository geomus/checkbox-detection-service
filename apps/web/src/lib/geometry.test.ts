import { summarize } from '@/lib/geometry';
import type { DetectedBox } from '@/lib/api';

describe('summarize', () => {
  it('counts checked and unchecked boxes', () => {
    const boxes: DetectedBox[] = [
      { bbox: [0, 0, 1, 1], is_checked: true },
      { bbox: [0, 0, 1, 1], is_checked: false },
      { bbox: [0, 0, 1, 1], is_checked: true }
    ];
    expect(summarize(boxes)).toEqual({ total: 3, checked: 2, unchecked: 1 });
  });
});

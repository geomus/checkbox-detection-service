import { createHash } from 'node:crypto';
import type { CheckboxDetector, DetectionResult } from './handler.js';

// Per-process memo so a repeat upload of the same image in a warm instance is not
// re-detected or re-billed. Per strategy, so a result is never served across
// strategies. Resets on cold start and is not shared between instances; the
// cross-instance version (DynamoDB with a TTL) is in docs/detection-approach.md.
const MAX_ENTRIES = 256;

export const withCache = (detector: CheckboxDetector): CheckboxDetector => {
  const cache = new Map<string, DetectionResult>();

  return async (input) => {
    const hash = createHash('sha256').update(input.imageBase64).digest('hex');
    const { width, height } = input.imageSize ?? {};
    const key = `${hash}|${width ?? ''}x${height ?? ''}`;

    const hit = cache.get(key);
    if (hit) return hit;

    const result = await detector(input);
    // crude cap; a full reset is fine for a warm-instance memo
    if (cache.size >= MAX_ENTRIES) cache.clear();
    cache.set(key, result);
    return result;
  };
};

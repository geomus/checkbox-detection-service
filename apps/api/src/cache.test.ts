import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withCache } from './cache.ts';
import type { CheckboxDetector } from './handler.ts';

const countingDetector = () => {
  let calls = 0;
  const fn: CheckboxDetector = async () => {
    calls += 1;
    return {
      boxes: [{ bbox: [1, 2, 3, 4] as [number, number, number, number], is_checked: true }]
    };
  };
  return { fn, calls: () => calls };
};

test('serves a repeat call from the cache', async () => {
  const base = countingDetector();
  const cached = withCache(base.fn);

  await cached({ imageBase64: 'AAAA' });
  await cached({ imageBase64: 'AAAA' });

  assert.equal(base.calls(), 1);
});

test('misses on a different image', async () => {
  const base = countingDetector();
  const cached = withCache(base.fn);

  await cached({ imageBase64: 'AAAA' });
  await cached({ imageBase64: 'BBBB' });

  assert.equal(base.calls(), 2);
});

test('keys on the image size as well as the bytes', async () => {
  const base = countingDetector();
  const cached = withCache(base.fn);

  await cached({ imageBase64: 'AAAA', imageSize: { width: 10, height: 10 } });
  await cached({ imageBase64: 'AAAA', imageSize: { width: 20, height: 20 } });

  assert.equal(base.calls(), 2);
});

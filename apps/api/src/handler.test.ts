import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, type CheckboxDetector } from './handler.ts';

type DetectorInput = Parameters<CheckboxDetector>[0];

const recordingDetector = () => {
  const calls: DetectorInput[] = [];
  const fn: CheckboxDetector = async (input) => {
    calls.push(input);
    return { boxes: [{ bbox: [1, 2, 3, 4], is_checked: true }] };
  };
  return { fn, calls };
};

const fakeImage = (bytes = 1024) => {
  const data = new Uint8Array(bytes);
  if (bytes >= 3) data.set([0xff, 0xd8, 0xff]); // JPEG magic so the content sniff passes
  return new File([data], 'doc.jpg', { type: 'image/jpeg' });
};

const body = (file: File | null, fields: Record<string, string> = {}) => {
  const fd = new FormData();
  if (file) fd.set('file', file);
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
};

const post = (app: ReturnType<typeof createApp>, fd: FormData) =>
  app.request('/detect', { method: 'POST', body: fd });

test('runs the opencv strategy by default and returns the detector output', async () => {
  const opencv = recordingDetector();
  const res = await post(createApp({ opencv: opencv.fn }), body(fakeImage()));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { boxes: [{ bbox: [1, 2, 3, 4], is_checked: true }] });
  assert.equal(opencv.calls.length, 1);
  assert.equal(opencv.calls[0].imageSize, undefined);
  assert.ok(opencv.calls[0].imageBase64.length > 0);
});

test('forwards the image size to the textract strategy', async () => {
  const textract = recordingDetector();
  const app = createApp({ opencv: recordingDetector().fn, textract: textract.fn });

  const res = await post(
    app,
    body(fakeImage(), { strategy: 'textract', width: '800', height: '600' })
  );

  assert.equal(res.status, 200);
  assert.deepEqual(textract.calls[0].imageSize, { width: 800, height: 600 });
});

test('rejects textract without width and height', async () => {
  const app = createApp({ opencv: recordingDetector().fn, textract: recordingDetector().fn });

  const res = await post(app, body(fakeImage(), { strategy: 'textract' }));

  assert.equal(res.status, 400);
});

test('rejects a request with no file', async () => {
  const res = await post(createApp({ opencv: recordingDetector().fn }), body(null));

  assert.equal(res.status, 400);
});

test('rejects an unknown strategy', async () => {
  const res = await post(
    createApp({ opencv: recordingDetector().fn }),
    body(fakeImage(), { strategy: 'magic' })
  );

  assert.equal(res.status, 400);
});

test('returns 503 when the requested strategy is not in the map', async () => {
  const app = createApp({ opencv: recordingDetector().fn });

  const res = await post(
    app,
    body(fakeImage(), { strategy: 'textract', width: '800', height: '600' })
  );

  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { message: 'detection strategy "textract" is disabled' });
});

test('returns 502 when the detector throws', async () => {
  const failing: CheckboxDetector = async () => {
    throw new Error('boom');
  };

  const res = await post(createApp({ opencv: failing }), body(fakeImage()));

  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { message: 'checkbox detection failed' });
});

test('rejects a file outside the allowed size range', async () => {
  const app = createApp({ opencv: recordingDetector().fn });

  assert.equal((await post(app, body(fakeImage(0)))).status, 400);
  assert.equal((await post(app, body(fakeImage(4 * 1024 * 1024 + 1)))).status, 400);
});

test('rejects a file whose bytes are not a JPEG or PNG', async () => {
  const notAnImage = new File(
    [new TextEncoder().encode('this is plain text, not an image')],
    'notes.txt',
    {
      type: 'text/plain'
    }
  );
  const res = await post(createApp({ opencv: recordingDetector().fn }), body(notAnImage));

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { message: 'file must be a JPEG or PNG image' });
});

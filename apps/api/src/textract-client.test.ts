import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AnalyzeDocumentCommand, type TextractClient } from '@aws-sdk/client-textract';
import { analyzeWithTextract } from './textract-client.ts';

const fakeTextract = (blocks: unknown[]) => {
  const sent: AnalyzeDocumentCommand[] = [];
  const client = {
    send: async (command: AnalyzeDocumentCommand) => {
      sent.push(command);
      return { Blocks: blocks };
    }
  } as unknown as TextractClient;
  return { client, sent };
};

const selectionBlock = (status: string, box: Record<string, number>) => ({
  BlockType: 'SELECTION_ELEMENT',
  SelectionStatus: status,
  Geometry: { BoundingBox: box }
});

const size = { width: 1000, height: 2000 };

test('maps a SELECTED element to a checked pixel bbox', async () => {
  const { client } = fakeTextract([
    selectionBlock('SELECTED', { Left: 0.1, Top: 0.2, Width: 0.05, Height: 0.04 })
  ]);

  const { boxes } = await analyzeWithTextract(client)({ imageBase64: 'AA==', imageSize: size });

  assert.deepEqual(boxes, [{ bbox: [100, 400, 150, 480], is_checked: true }]);
});

test('maps NOT_SELECTED to unchecked', async () => {
  const { client } = fakeTextract([
    selectionBlock('NOT_SELECTED', { Left: 0, Top: 0, Width: 0.1, Height: 0.1 })
  ]);

  const { boxes } = await analyzeWithTextract(client)({ imageBase64: 'AA==', imageSize: size });

  assert.equal(boxes.length, 1);
  assert.equal(boxes[0].is_checked, false);
});

test('ignores blocks that are not selection elements', async () => {
  const { client } = fakeTextract([
    {
      BlockType: 'WORD',
      Text: 'Owner',
      Geometry: { BoundingBox: { Left: 0, Top: 0, Width: 1, Height: 1 } }
    },
    selectionBlock('SELECTED', { Left: 0.5, Top: 0.5, Width: 0.1, Height: 0.1 })
  ]);

  const { boxes } = await analyzeWithTextract(client)({ imageBase64: 'AA==', imageSize: size });

  assert.equal(boxes.length, 1);
});

test('skips a selection element with no bounding box', async () => {
  const { client } = fakeTextract([
    { BlockType: 'SELECTION_ELEMENT', SelectionStatus: 'SELECTED' },
    selectionBlock('SELECTED', { Left: 0.5, Top: 0.5, Width: 0.1, Height: 0.1 })
  ]);

  const { boxes } = await analyzeWithTextract(client)({ imageBase64: 'AA==', imageSize: size });

  assert.equal(boxes.length, 1);
});

test('returns boxes in reading order', async () => {
  const { client } = fakeTextract([
    selectionBlock('SELECTED', { Left: 0.5, Top: 0.5, Width: 0.05, Height: 0.03 }),
    selectionBlock('NOT_SELECTED', { Left: 0.1, Top: 0.1, Width: 0.05, Height: 0.03 }),
    selectionBlock('NOT_SELECTED', { Left: 0.6, Top: 0.1, Width: 0.05, Height: 0.03 })
  ]);

  const { boxes } = await analyzeWithTextract(client)({ imageBase64: 'AA==', imageSize: size });

  assert.deepEqual(
    boxes.map((b) => b.bbox[0]),
    [100, 600, 500]
  );
});

test('throws when the image size is missing', async () => {
  const { client } = fakeTextract([]);

  await assert.rejects(() => analyzeWithTextract(client)({ imageBase64: 'AA==' }));
});

test('requests the FORMS and TABLES features with the image bytes', async () => {
  const { client, sent } = fakeTextract([]);

  await analyzeWithTextract(client)({ imageBase64: 'AA==', imageSize: size });

  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].input.FeatureTypes, ['FORMS', 'TABLES']);
  assert.ok(sent[0].input.Document?.Bytes);
});

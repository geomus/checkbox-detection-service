import { AnalyzeDocumentCommand, type Block, type TextractClient } from '@aws-sdk/client-textract';
import type { CheckboxDetector, DetectedBox } from './handler.js';

// `AnalyzeDocument` with the FORMS and TABLES features returns a `SELECTION_ELEMENT`
// block for every checkbox/radio button, each with a `SelectionStatus` and a bounding
// box as page ratios (0-1). TABLES is requested too: Textract only returns selection
// elements inside table cells when it is asked for tables, and most appraisal checkboxes
// sit in tables. I scale the ratios to pixels with the caller's image size and treat
// `SELECTED` as checked.

// FORMS also links each checkbox to its printed label through a KEY_VALUE_SET graph:
// a KEY block's CHILD words spell the label, its VALUE block's CHILD is the
// SELECTION_ELEMENT. I walk that once so each box can carry the field name. A
// checkbox Textract only sees as a bare table cell has no KEY and stays unlabeled.
const labelsBySelectionId = (blocks: Block[]): Map<string, string> => {
  const byId = new Map(blocks.map((block) => [block.Id, block]));
  const relatedIds = (block: Block | undefined, type: string) =>
    (block?.Relationships ?? []).filter((r) => r.Type === type).flatMap((r) => r.Ids ?? []);

  const labels = new Map<string, string>();
  for (const key of blocks) {
    if (key.BlockType !== 'KEY_VALUE_SET' || !key.EntityTypes?.includes('KEY')) continue;
    const text = relatedIds(key, 'CHILD')
      .map((id) => byId.get(id)?.Text)
      .filter(Boolean)
      .join(' ')
      .trim();
    if (!text) continue;
    for (const valueId of relatedIds(key, 'VALUE')) {
      for (const childId of relatedIds(byId.get(valueId), 'CHILD')) {
        if (byId.get(childId)?.BlockType === 'SELECTION_ELEMENT') labels.set(childId, text);
      }
    }
  }
  return labels;
};

export const analyzeWithTextract = (client: TextractClient): CheckboxDetector => {
  return async ({ imageBase64, imageSize }) => {
    if (!imageSize) {
      throw new Error('textract strategy requires the image width and height');
    }
    const { width, height } = imageSize;

    const response = await client.send(
      new AnalyzeDocumentCommand({
        Document: { Bytes: Buffer.from(imageBase64, 'base64') },
        FeatureTypes: ['FORMS', 'TABLES']
      })
    );

    const blocks = response.Blocks ?? [];
    const labels = labelsBySelectionId(blocks);

    const boxes: DetectedBox[] = [];
    for (const block of blocks) {
      if (block.BlockType !== 'SELECTION_ELEMENT') continue;
      const box = block.Geometry?.BoundingBox;
      if (!box) continue;

      const left = box.Left ?? 0;
      const top = box.Top ?? 0;
      const label = labels.get(block.Id ?? '');
      boxes.push({
        bbox: [
          Math.round(left * width),
          Math.round(top * height),
          Math.round((left + (box.Width ?? 0)) * width),
          Math.round((top + (box.Height ?? 0)) * height)
        ],
        is_checked: block.SelectionStatus === 'SELECTED',
        ...(label !== undefined && { label })
      });
    }

    // Same reading-order sort the opencv detector applies, so both strategies
    // return boxes top-to-bottom, left-to-right. Banding the top edge absorbs a
    // few px of row jitter on a skewed scan before ordering left-to-right.
    const ROW_BAND_PX = 24;
    boxes.sort(
      (a, b) =>
        Math.floor(a.bbox[1] / ROW_BAND_PX) - Math.floor(b.bbox[1] / ROW_BAND_PX) ||
        a.bbox[0] - b.bbox[0]
    );

    return { boxes };
  };
};

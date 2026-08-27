import { AnalyzeDocumentCommand, type TextractClient } from '@aws-sdk/client-textract';
import type { CheckboxDetector, DetectedBox } from './handler.js';

// `AnalyzeDocument` with the FORMS and TABLES features returns a `SELECTION_ELEMENT`
// block for every checkbox/radio button, each with a `SelectionStatus` and a bounding
// box as page ratios (0-1). TABLES is requested too: Textract only returns selection
// elements inside table cells when it is asked for tables, and most appraisal checkboxes
// sit in tables. I scale the ratios to pixels with the caller's image size and treat
// `SELECTED` as checked.
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

    const boxes: DetectedBox[] = [];
    for (const block of response.Blocks ?? []) {
      if (block.BlockType !== 'SELECTION_ELEMENT') continue;
      const box = block.Geometry?.BoundingBox;
      if (!box) continue;

      const left = box.Left ?? 0;
      const top = box.Top ?? 0;
      boxes.push({
        bbox: [
          Math.round(left * width),
          Math.round(top * height),
          Math.round((left + (box.Width ?? 0)) * width),
          Math.round((top + (box.Height ?? 0)) * height)
        ],
        is_checked: block.SelectionStatus === 'SELECTED'
      });
    }

    return { boxes };
  };
};

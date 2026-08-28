import { Hono } from 'hono';
import { z } from 'zod';

export type DetectedBox = {
  bbox: [number, number, number, number];
  is_checked: boolean;
};

export type CheckboxDetector = (input: {
  imageBase64: string;
  imageSize?: { width: number; height: number };
}) => Promise<{ boxes: DetectedBox[] }>;

export const DETECTION_STRATEGIES = ['opencv', 'textract'] as const;
export type DetectionStrategy = (typeof DETECTION_STRATEGIES)[number];

// Multipart fields come in as strings, so width/height get turned into numbers.
// Textract needs the pixel size to turn its ratio coords into the pixel bbox the
// contract asks for; the opencv strategy decodes the image itself and ignores them.
const detectRequestSchema = z
  .object({
    file: z.instanceof(File, { error: 'file must be an uploaded image' }),
    strategy: z.enum(DETECTION_STRATEGIES).default('opencv'),
    width: z.coerce.number().int().positive().optional(),
    height: z.coerce.number().int().positive().optional()
  })
  .refine((v) => v.strategy !== 'textract' || (v.width !== undefined && v.height !== undefined), {
    error: 'width and height are required when strategy is "textract"'
  });

const convertFileToBase64 = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  return Buffer.from(arrayBuffer).toString('base64');
};

// Partial: a strategy the deployment has turned off (see TEXTRACT_ENABLED) is
// just missing from the map.
export const createApp = (
  checkboxDetectors: Partial<Record<DetectionStrategy, CheckboxDetector>>
) => {
  const app = new Hono();

  // A detector that throws (bad AWS credentials, the detector Lambda erroring, a
  // corrupt image that got past validation) is an upstream failure, not a 500 in
  // this handler. Answer with a short message and no stack.
  app.onError((err, c) => {
    console.error('detection failed:', err);
    return c.json({ message: 'checkbox detection failed' }, 502);
  });

  app.post('/detect', async (c) => {
    const parsed = detectRequestSchema.safeParse(await c.req.parseBody());
    if (!parsed.success) {
      return c.json({ message: 'invalid request', issues: parsed.error.issues }, 400);
    }

    const { file, strategy, width, height } = parsed.data;

    const detector = checkboxDetectors[strategy];
    if (!detector) {
      return c.json({ message: `detection strategy "${strategy}" is disabled` }, 503);
    }

    const imageBase64 = await convertFileToBase64(file);
    const result = await detector({
      imageBase64,
      imageSize: width && height ? { width, height } : undefined
    });

    return c.json(result);
  });

  return app;
};

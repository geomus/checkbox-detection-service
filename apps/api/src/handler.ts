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

export type AppBindings = {
  Bindings: {
    requestContext: {
      checkboxDetectors: Record<DetectionStrategy, CheckboxDetector>;
    };
  };
};

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

/**
 * The Hono app for the API service.
 */
export const app = new Hono<AppBindings>();

/**
 * The /detect endpoint accepts a multipart/form-data request with a `file` field
 * containing an image, plus an optional `strategy` (`opencv` default, or
 * `textract`) and, for `textract`, the image `width`/`height` in pixels. It
 * returns the detected checkboxes.
 */
app.post('/detect', async (c) => {
  const parsed = detectRequestSchema.safeParse(await c.req.parseBody());
  if (!parsed.success) {
    return c.json({ message: 'invalid request', issues: parsed.error.issues }, 400);
  }

  const { file, strategy, width, height } = parsed.data;
  const imageBase64 = await convertFileToBase64(file);

  const detect = c.env.requestContext.checkboxDetectors[strategy];
  const result = await detect({
    imageBase64,
    imageSize: width && height ? { width, height } : undefined
  });

  return c.json(result);
});

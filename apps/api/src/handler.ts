import { Hono } from 'hono';
import { z } from 'zod';

export type DetectedBox = {
  bbox: [number, number, number, number];
  is_checked: boolean;
};

export type DetectionResult = { boxes: DetectedBox[] };

export type CheckboxDetector = (input: {
  imageBase64: string;
  imageSize?: { width: number; height: number };
}) => Promise<DetectionResult>;

const DETECTION_STRATEGIES = ['opencv', 'textract'] as const;
export type DetectionStrategy = (typeof DETECTION_STRATEGIES)[number];

// base64 makes the file ~1/3 bigger, so a 4 MB cap stays under Lambda's 6 MB invoke limit.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

// Multipart fields come in as strings, so width/height get turned into numbers.
// Textract needs the pixel size to turn its ratio coords into the pixel bbox the
// contract asks for; the opencv strategy decodes the image itself and ignores them.
const detectRequestSchema = z
  .object({
    file: z
      .instanceof(File, { error: 'file must be an uploaded image' })
      .refine((f) => f.size > 0 && f.size <= MAX_UPLOAD_BYTES, {
        error: 'file must be a non-empty image under 4 MB'
      }),
    strategy: z.enum(DETECTION_STRATEGIES).default('opencv'),
    width: z.coerce.number().int().positive().optional(),
    height: z.coerce.number().int().positive().optional()
  })
  .refine((v) => v.strategy !== 'textract' || (v.width !== undefined && v.height !== undefined), {
    error: 'width and height are required when strategy is "textract"'
  });

const toBuffer = async (file: File): Promise<Buffer> => Buffer.from(await file.arrayBuffer());

// Zod checks the size and that it is a file, not the bytes. A direct API caller
// can send anything, so sniff the magic number before spending a detector invoke.
const looksLikeImage = (bytes: Buffer): boolean =>
  bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ||
  bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

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

    const bytes = await toBuffer(file);
    if (!looksLikeImage(bytes)) {
      return c.json({ message: 'file must be a JPEG or PNG image' }, 400);
    }

    const result = await detector({
      imageBase64: bytes.toString('base64'),
      imageSize: width && height ? { width, height } : undefined
    });

    return c.json(result);
  });

  return app;
};

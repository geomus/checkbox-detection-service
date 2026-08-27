import { Hono } from 'hono';

export type DetectedBox = {
  bbox: [number, number, number, number];
  is_checked: boolean;
};

export type CheckboxDetector = (input: {
  imageBase64: string;
}) => Promise<{ boxes: DetectedBox[] }>;

export type AppBindings = {
  Bindings: {
    requestContext: {
      checkboxDetector: CheckboxDetector;
    };
  };
};

const validateFile = (file: unknown): file is File => {
  return file instanceof File;
}

const convertFileToBase64 = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  return Buffer.from(arrayBuffer).toString('base64');
}

/**
 * The Hono app for the API service.
 */
export const app = new Hono<AppBindings>();

/**
 * The /detect endpoint accepts a multipart/form-data request with a file field
 * containing an image. It returns the detected checkboxes in the image.
 * @param c The Hono context object.
 * @returns A JSON response with the detected checkboxes.
 */
app.post('/detect', async (c) => {
  const body = await c.req.parseBody();
  const file = body['file'];

  // no size/content-type check yet, so a huge or non-image upload reaches the
  // detector invoke below instead of failing fast here with a clean 400. zod's
  // already a dependency for exactly this, just haven't wired it up yet.
  if (!validateFile(file)) {
    return c.json({ message: 'file is required' }, 400);
  }

  const imageBase64 = await convertFileToBase64(file);
  const result = await c.env.requestContext.checkboxDetector({ imageBase64 });

  return c.json(result);
});

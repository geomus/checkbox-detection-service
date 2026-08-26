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

export const app = new Hono<AppBindings>();

app.post('/detect', async (c) => {
  const body = await c.req.parseBody();
  const file = body['file'];

  if (!(file instanceof File)) {
    return c.json({ message: 'file is required' }, 400);
  }

  const imageBase64 = Buffer.from(await file.arrayBuffer()).toString('base64');
  const result = await c.env.requestContext.checkboxDetector({ imageBase64 });

  return c.json(result);
});

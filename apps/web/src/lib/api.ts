export type DetectedBox = {
  bbox: [number, number, number, number];
  is_checked: boolean;
};

export type DetectionStrategy = 'opencv' | 'textract';

export type DetectResult = { ok: true; boxes: DetectedBox[] } | { ok: false; message: string };

type DetectParams = {
  file: File;
  strategy: DetectionStrategy;
  width: number;
  height: number;
};

// Dev default. `yarn deploy` builds the site with VITE_API_URL set to the deployed API URL.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

// The UI's only call to the API. It never throws: transport and HTTP errors come
// back as { ok: false } with a message already safe to render.
export const detect = async ({
  file,
  strategy,
  width,
  height
}: DetectParams): Promise<DetectResult> => {
  const form = new FormData();
  form.append('file', file);
  form.append('strategy', strategy);
  // Textract scales its ratio coords to pixels with these; opencv ignores them.
  form.append('width', String(width));
  form.append('height', String(height));

  let response: Response;
  try {
    response = await fetch(`${API_URL}/detect`, { method: 'POST', body: form });
  } catch {
    return {
      ok: false,
      message: 'Could not reach the detection service. Check your connection and try again.'
    };
  }

  const body = await response.json().catch(() => null);

  if (response.ok) {
    return Array.isArray(body?.boxes)
      ? { ok: true, boxes: body.boxes }
      : { ok: false, message: 'The detection service returned an unexpected response.' };
  }

  const apiMessage = typeof body?.message === 'string' ? body.message : undefined;
  if (response.status === 400) {
    // 400 carries a Zod issue list; surface the messages if they are there.
    const issues: unknown[] = Array.isArray(body?.issues) ? body.issues : [];
    const detail = issues
      .map((issue) => (issue as { message?: string }).message)
      .filter(Boolean)
      .join('; ');
    return { ok: false, message: detail || apiMessage || 'The upload was rejected.' };
  }
  if (response.status === 503) {
    return {
      ok: false,
      message: apiMessage || 'That detection strategy is turned off on this deployment.'
    };
  }
  return {
    ok: false,
    message: apiMessage || 'The detection service failed. Try again in a moment.'
  };
};

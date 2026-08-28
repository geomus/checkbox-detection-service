export type DetectedBox = {
  bbox: [number, number, number, number]
  is_checked: boolean
}

export type DetectionStrategy = 'opencv' | 'textract'

export type DetectResult = { ok: true; boxes: DetectedBox[] } | { ok: false; kind: 'validation' | 'disabled' | 'server' | 'network'; message: string }

type DetectParams = {
  file: File
  strategy: DetectionStrategy
  width: number
  height: number
}

// Falls back to the deployed API so a bare `yarn dev` or the built site works with no setup;
// point VITE_API_URL at http://localhost:3000 in .env.local for full-stack local dev.
const API_URL = import.meta.env.VITE_API_URL ?? 'https://mjcb4evp08.execute-api.us-east-1.amazonaws.com'

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null

const isDetectedBox = (value: unknown): value is DetectedBox => {
  const box = asRecord(value)
  return (
    box !== null &&
    Array.isArray(box.bbox) &&
    box.bbox.length === 4 &&
    box.bbox.every((n) => typeof n === 'number') &&
    typeof box.is_checked === 'boolean'
  )
}

const parseBoxes = (body: unknown): DetectedBox[] | null => {
  const boxes = asRecord(body)?.boxes
  return Array.isArray(boxes) && boxes.every(isDetectedBox) ? (boxes as DetectedBox[]) : null
}

export const detect = async ({ file, strategy, width, height }: DetectParams): Promise<DetectResult> => {
  const form = new FormData()
  form.append('file', file)
  form.append('strategy', strategy)
  // Textract needs the pixel size to scale its ratio coords; opencv ignores it, so always send it.
  form.append('width', String(width))
  form.append('height', String(height))

  let response: Response
  try {
    response = await fetch(`${API_URL}/detect`, { method: 'POST', body: form })
  } catch {
    return { ok: false, kind: 'network', message: 'Could not reach the detection service. Check your connection and try again.' }
  }

  const body = await response.json().catch(() => null)
  const record = asRecord(body)
  const apiMessage = typeof record?.message === 'string' ? record.message : undefined

  if (response.ok) {
    const boxes = parseBoxes(body)
    return boxes ? { ok: true, boxes } : { ok: false, kind: 'server', message: 'The detection service returned an unexpected response.' }
  }

  if (response.status === 400) {
    const issues = record?.issues
    const detail = Array.isArray(issues)
      ? issues
          .map((issue) => asRecord(issue)?.message)
          .filter((m): m is string => typeof m === 'string')
          .join('; ')
      : ''
    return { ok: false, kind: 'validation', message: detail || apiMessage || 'The upload was rejected.' }
  }
  if (response.status === 503) {
    return { ok: false, kind: 'disabled', message: apiMessage || 'That detection strategy is turned off on this deployment.' }
  }
  return { ok: false, kind: 'server', message: apiMessage || 'The detection service failed. Try again in a moment.' }
}

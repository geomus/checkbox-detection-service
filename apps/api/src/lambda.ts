import { LambdaClient } from '@aws-sdk/client-lambda';
import { TextractClient } from '@aws-sdk/client-textract';
import { handle } from 'hono/aws-lambda';
import {
  createApp,
  type CheckboxDetector,
  type DetectionResult,
  type DetectionStrategy
} from './handler.js';
import { invokeDetectorLambda } from './detector-client.js';
import { analyzeWithTextract } from './textract-client.js';
import { withCache } from './cache.js';

// serverless-offline sets IS_OFFLINE; talk to the local python shim then. Same
// throw-on-any-failure contract as the real Lambda invoke, so handler.ts does not
// branch on the environment.
const invokeLocalShim =
  (url: string): CheckboxDetector =>
  async (input) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    });
    if (!response.ok) {
      throw new Error(`detector local shim returned ${response.status}: ${await response.text()}`);
    }
    return (await response.json()) as DetectionResult;
  };

const opencvDetector: CheckboxDetector =
  process.env.IS_OFFLINE === 'true'
    ? invokeLocalShim(process.env.DETECTOR_LOCAL_URL ?? 'http://localhost:8000')
    : invokeDetectorLambda(new LambdaClient({}), process.env.DETECTOR_FUNCTION_NAME ?? '');

// Textract has no local emulation: strategy=textract hits the real service even
// in local dev (needs AWS credentials). The default opencv path stays offline.
const checkboxDetectors: Partial<Record<DetectionStrategy, CheckboxDetector>> = {
  opencv: withCache(opencvDetector)
};

// TEXTRACT_ENABLED=false drops the paid strategy: no client is built and the API
// answers strategy=textract with 503. Absent or anything but "false" keeps it on.
if (process.env.TEXTRACT_ENABLED !== 'false') {
  checkboxDetectors.textract = withCache(analyzeWithTextract(new TextractClient({})));
}

export const handler = handle(createApp(checkboxDetectors));

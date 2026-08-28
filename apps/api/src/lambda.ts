import { LambdaClient } from '@aws-sdk/client-lambda';
import { TextractClient } from '@aws-sdk/client-textract';
import { handle } from 'hono/aws-lambda';
import { createApp, type CheckboxDetector, type DetectionStrategy } from './handler.js';
import { invokeDetectorLambda, invokeDetectorLocal } from './detector-client.js';
import { analyzeWithTextract } from './textract-client.js';

// serverless-offline sets IS_OFFLINE, so this swaps the real invoke for the
// local python shim without any branching inside handler.ts
const opencvDetector: CheckboxDetector =
  process.env.IS_OFFLINE === 'true'
    ? invokeDetectorLocal(process.env.DETECTOR_LOCAL_URL ?? 'http://localhost:8000')
    : invokeDetectorLambda(new LambdaClient({}), process.env.DETECTOR_FUNCTION_NAME ?? '');

// Textract has no local emulation: strategy=textract hits the real service even
// in local dev (needs AWS credentials). The default opencv path stays offline.
const checkboxDetectors: Partial<Record<DetectionStrategy, CheckboxDetector>> = {
  opencv: opencvDetector
};

// TEXTRACT_ENABLED=false drops the paid strategy: no client is built and the API
// answers strategy=textract with 503. Absent or anything but "false" keeps it on.
if (process.env.TEXTRACT_ENABLED !== 'false') {
  checkboxDetectors.textract = analyzeWithTextract(new TextractClient({}));
}

export const handler = handle(createApp(checkboxDetectors));

import { LambdaClient } from '@aws-sdk/client-lambda';
import { TextractClient } from '@aws-sdk/client-textract';
import { handle } from 'hono/aws-lambda';
import type { LambdaContext, LambdaEvent } from 'hono/aws-lambda';
import { app, type CheckboxDetector, type DetectionStrategy } from './handler.js';
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
const checkboxDetectors: Record<DetectionStrategy, CheckboxDetector> = {
  opencv: opencvDetector,
  textract: analyzeWithTextract(new TextractClient({}))
};

const honoHandler = handle(app);

type InjectedRequestContext = LambdaEvent['requestContext'] & {
  checkboxDetectors: Record<DetectionStrategy, CheckboxDetector>;
};

/**
 * The Lambda handler for the API service. This is the entry point for AWS Lambda.
 * @param event The Lambda event object.
 * @param context The Lambda context object.
 * @returns A Promise resolving to the result of the Hono handler.
 */
export const handler = (event: LambdaEvent, context: LambdaContext) => {
  // requestContext's real type doesn't know about checkboxDetectors, cast it in
  // once here so handler.ts can read it back out fully typed
  const enrichedEvent = {
    ...event,
    requestContext: {
      ...event.requestContext,
      checkboxDetectors
    } as InjectedRequestContext
  } as LambdaEvent;

  return honoHandler(enrichedEvent, context);
};

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { handle } from 'hono/aws-lambda';
import type { LambdaContext, LambdaEvent } from 'hono/aws-lambda';
import { app, type CheckboxDetector } from './handler.js';

const invokeDetectorLambda = (client: LambdaClient, functionName: string): CheckboxDetector => {
  return async (input) => {
    const response = await client.send(
      new InvokeCommand({
        FunctionName: functionName,
        InvocationType: 'RequestResponse',
        Payload: Buffer.from(JSON.stringify(input)),
      }),
    );

    if (!response.Payload) {
      throw new Error('detector invoke returned no payload');
    }

    return JSON.parse(Buffer.from(response.Payload).toString('utf-8'));
  };
};

const invokeDetectorLocal = (url: string): CheckboxDetector => {
  return async (input) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });

    return (await response.json()) as Awaited<ReturnType<CheckboxDetector>>;
  };
};

// serverless-offline sets IS_OFFLINE, so this swaps the real invoke for the
// local python shim without any branching inside handler.ts
const checkboxDetector: CheckboxDetector =
  process.env.IS_OFFLINE === 'true'
    ? invokeDetectorLocal(process.env.DETECTOR_LOCAL_URL ?? 'http://localhost:8000')
    : invokeDetectorLambda(new LambdaClient({}), process.env.DETECTOR_FUNCTION_NAME ?? '');

const honoHandler = handle(app);

type InjectedRequestContext = LambdaEvent['requestContext'] & {
  checkboxDetector: CheckboxDetector;
};

export const handler = (event: LambdaEvent, context: LambdaContext) => {
  // requestContext's real type doesn't know about checkboxDetector, cast it in
  // once here so handler.ts can read it back out fully typed
  const augmentedEvent = {
    ...event,
    requestContext: {
      ...event.requestContext,
      checkboxDetector,
    } as InjectedRequestContext,
  } as LambdaEvent;

  return honoHandler(augmentedEvent, context);
};

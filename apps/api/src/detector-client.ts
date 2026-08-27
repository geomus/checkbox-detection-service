import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import type { CheckboxDetector } from './handler.js';

/**
 * Returns a CheckboxDetector that invokes the real detector Lambda function.
 * @param client The AWS Lambda client to use for invoking the function.
 * @param functionName The name of the detector Lambda function.
 * @returns A CheckboxDetector instance.
 */
export const invokeDetectorLambda = (client: LambdaClient, functionName: string): CheckboxDetector => {
  return async (input) => {
    // a synchronous invoke limits the payload to 6MB, and a big base64 scan can get
    // close. If that ever bites, switch to an S3 upload + async flow.
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

    const payload = Buffer.from(response.Payload).toString('utf-8');
    if (response.FunctionError) {
      throw new Error(`detector invoke failed: ${payload}`);
    }

    return JSON.parse(payload);
  };
};

/**
 * Returns a CheckboxDetector that invokes the local detector service.
 * @param url The URL of the local detector service.
 * @returns A CheckboxDetector instance.
 */
export const invokeDetectorLocal = (url: string): CheckboxDetector => {
  return async (input) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(`detector local shim returned ${response.status}: ${await response.text()}`);
    }

    return (await response.json()) as Awaited<ReturnType<CheckboxDetector>>;
  };
};

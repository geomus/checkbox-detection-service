import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import type { CheckboxDetector, DetectionResult } from './handler.js';

// Any failure here is left to throw: a FunctionError in the response, a throttle,
// a dropped connection. app.onError in handler.ts is the one place that turns it
// into a 502.
export const invokeDetectorLambda = (
  client: LambdaClient,
  functionName: string
): CheckboxDetector => {
  return async (input) => {
    // a synchronous invoke limits the payload to 6MB, and a big base64 scan can get
    // close. If that ever bites, switch to an S3 upload + async flow.
    const response = await client.send(
      new InvokeCommand({
        FunctionName: functionName,
        InvocationType: 'RequestResponse',
        Payload: Buffer.from(JSON.stringify(input))
      })
    );

    if (!response.Payload) {
      throw new Error('detector invoke returned no payload');
    }

    const payload = Buffer.from(response.Payload).toString('utf-8');
    if (response.FunctionError) {
      throw new Error(`detector invoke failed: ${payload}`);
    }

    return JSON.parse(payload) as DetectionResult;
  };
};

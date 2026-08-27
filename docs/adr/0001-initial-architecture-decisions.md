# ADR-0001: Initial architecture decisions

- Status: Accepted
- Date: 2026-08-26

## Context

The brief asks for an HTTP API that detects and classifies checkboxes in scanned document images. Two things shaped how I approached it. First, HomeVision's own job posting lists Go/React/TypeScript/AWS as the core stack, calls out Python specifically as a bonus for data/ML work, and names Lambda/SQS/S3 as the cloud-native mindset they're looking for. Second, Silver.dev's take-home guide is pretty blunt about two things: pick the stack closest to the client's own, and a single bug or a decision you can't explain on the spot is enough to sink an otherwise solid submission. I used both of those as my filter, on top of my own bias toward keeping things small enough that I can defend every line of it live.

## Decisions

### 1. Node/TypeScript for the API, a small Python module for the actual detection

I split this into two pieces: the HTTP surface, validation, orchestration and tests live in Node/TypeScript (Hono, on Lambda). The image-processing itself is a small, framework-free Python function, called from the Node side through the AWS SDK's `LambdaClient.invoke()`, a real Lambda-to-Lambda call, not two web servers talking HTTP to each other.

I went with Python for the detector because it's genuinely the standard tool for this kind of classical computer-vision work. Pretty much every reference implementation of checkbox detection I looked at during research used OpenCV in Python (there's even a packaged version of almost exactly this technique on PyPI, `boxdetect`, contour detection plus a fill-ratio check). It also lines up with the job posting's Python-in-data/ML bonus, without me having to stretch for it. I kept it deliberately small (no Flask, no FastAPI, no ORM, nothing beyond the detection function itself), so there's nothing in there I can't explain line by line if asked.

For the Node side I reused the same two-file shape I already use in production: a `handler.ts` with pure business logic that never touches AWS directly (it gets everything it needs handed to it), and a `lambda.ts` that builds the real AWS SDK client and wires it in before calling the handler. Locally that same capability points at a local endpoint instead of the deployed function, no branching, no wrapper needed on the Python side either way.

**Update:** the "handed to it" started as a capability smuggled through the Lambda `event.requestContext` object, which needed a bespoke intersection type and a couple of `as` casts. I replaced it with a plain `createApp(detectors)` factory: `handler.ts` exports it, `lambda.ts` calls `handle(createApp(map))`. Same idea, no casts, nothing to explain away in a walkthrough.

One thing I deliberately left out: a functional-programming library like Ramda. I use it daily at my job for exactly this kind of dependency-injection pattern, but this project has one injected capability and three straightforward steps: validate, call it, shape the response. That's not enough real complexity to earn a dependency whose whole value is composing many small transformations. A couple of plain functions do the same job and read easier for anyone reviewing this cold.

The honest trade-off here is that two languages in one small repo is more moving parts than a single-language solution would be. I'm managing that risk by keeping the Python side intentionally tiny, and by getting the integration between the two working end-to-end with stub functions before writing any real detection logic, so I find out early if the plumbing has a problem, not the night before it's due.

### 2. Hono instead of Express or Fastify

Hono ships its own adapter (`hono/aws-lambda`) that runs unmodified on Lambda, locally, and on edge runtimes, without needing something like `serverless-http` the way Express or Fastify would. It also has first-class TypeScript inference and pairs cleanly with Zod, which is what I want for validating the upload. A single Lambda that handles its own routing is a well-worn shape for a service this small, and Hono is the lightest way I know to write that handler. The trade-off is a smaller ecosystem than Express, fewer answers on Stack Overflow if something breaks. Fine for a single-endpoint service.

### 3. Classical computer vision, not a trained model

Grayscale, threshold, find contours, filter the candidates by size and aspect ratio, then a fill-ratio check to call each one checked or unchecked. I implemented this straight against OpenCV rather than pulling in something like `boxdetect`, even though it does almost the same thing. Using it as a dependency would mean standing behind a pipeline I didn't write, which I don't want to do in a follow-up interview.

The brief says perfect accuracy isn't expected, and this technique needs no training data and nothing that has to be explained on faith instead of by just reading the code. The cost is a lower ceiling on accuracy, especially on layouts I haven't seen, which I'm fine accepting given the brief's own tolerance for imperfect results. The full build-vs-buy-vs-train comparison, including why I didn't fine-tune an object detector, is in ADR-0002.

### 4. API Gateway (`httpApi`), not a Lambda Function URL

**Update:** originally built this against a plain Function URL (see the reasoning below, still valid on its own terms). Reversed it once a deploy spike surfaced a real cost: `serverless-offline` (the version compatible with Serverless Framework v3) only emulates API Gateway/ALB/WebSocket/schedule events, and it has no support at all for Function URLs, confirmed by reading its source (`src/events/` has no Function-URL handler). The two third-party plugins that patch this gap are thin, single-maintainer packages, not something I want standing between me and the one HTTP endpoint this whole project exposes. The clean fix without extra tooling would have been `@hono/node-server` (Hono's own official Node adapter) plus switching capability injection from mutating `event.requestContext` to Hono's `c.set`/`c.get`, which works identically on any runtime, a legitimate option kept here for the record. But the original reason for avoiding API Gateway in the first place (its free tier lapsing after an account's first 12 months, unlike Lambda's own perpetual free tier) doesn't apply to this project: it has ~$100 in AWS credits, a short review window, and no plan to keep this exact stack running long-term (a cheaper/free host is the likely home once the review is done). With that constraint gone, `httpApi` wins outright: `serverless-offline` supports it natively (zero custom local-dev code), it's the far more conventional AWS pattern for this exact shape of service, and Function URLs and `httpApi` (payload format 2.0) share the same event/response envelope, so none of the Node handler code needed to change, only `serverless.yml`.

Original reasoning, still accurate for a project that actually needs to run this way for a long time: Lambda's free tier (a million requests and 400,000 GB-seconds of compute a month) never expires, on any account. API Gateway's free tier, by contrast, only lasts the first 12 months of an account's life. Staying out of a VPC entirely also means no NAT Gateway, which is the cost that quietly kills small serverless projects, and that part of the decision stands unchanged.

### 5. Everything in one AWS account, no separate frontend host

The frontend build sits in an S3 bucket, deployed from the same account and the same `serverless.yml` as the backend, not on something like Vercel. I considered serving the static frontend straight from the API's own Lambda (Hono can do this), but that's a known anti-pattern: paying for a Lambda invocation on every image or CSS request that doesn't need any logic behind it. Keeping the static assets in S3 avoids that without introducing a second hosting provider to manage. The cost of this is that a plain S3 website endpoint is HTTP only, not HTTPS, unless I put CloudFront in front of it, which I'm deliberately leaving for later, flagged as a TODO in the code rather than something I'm solving now.

### 6. Yarn workspaces, no Turborepo

One repo, `apps/api` and `apps/web` as Yarn workspaces, `services/detector` sitting outside that graph since it's Python, and `serverless.yml` at the root. A monorepo keeps one git history for a project this size, and Turborepo's whole value is caching builds across a lot of interdependent packages, and with two JS packages that payoff just isn't there yet. If this grows into more interdependent packages later, worth revisiting.

### 7. Serverless Framework v3 for the infrastructure

One `serverless.yml` describes both Lambdas, the HTTP endpoint and the frontend bucket, and `yarn deploy` runs the whole thing in one command. I stayed on v3 because v4 moved to a licensed model that needs a paid seat for commercial use, and nothing here needs what v4 added. CDK or SST would give me typed infrastructure, but that is more machinery than three resources justify, and SAM would not cover syncing the frontend build to S3 in the same step. If this grew past a handful of resources I would move to CDK.

v3 stopped getting updates at the end of 2024, and its config schema only knows Node runtimes up to `nodejs20.x`, so `runtime: nodejs24.x` prints a warning at deploy time; the function still packages and runs on 24.x, the check is just a stale client-side allow-list. For a take-home that ships once and runs through a review window, that trade is fine. If this were long-lived I would move to v4 (its license is free below a revenue threshold) or to CDK.

## Where this leaves me

Two languages, two different ways of packaging a Lambda, and the choice of API Gateway are all things a reviewer who knows AWS is likely to ask about directly. I wrote each decision above so I can explain it in a sentence or two in that conversation. The bet across all of it is the same: something smaller that I fully understand beats something bigger that looks more impressive but that I can't defend line by line when asked.

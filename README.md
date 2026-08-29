# Checkbox Detection Service

Detects and classifies checkboxes (filled or unfilled) in scanned document images. Built as a take-home technical challenge.

Live demo: http://checkbox-detection-service.s3-website-us-east-1.amazonaws.com

## Project structure

```
apps/
  api/        Node.js + TypeScript + Hono API (AWS Lambda)
  web/        React + Vite + TypeScript frontend
services/
  detector/   Python + OpenCV checkbox detection (Lambda container image)
docs/
  adr/        Architecture decision records
  challenge/  Original brief + sample images
serverless.yml  Serverless Framework config (both Lambda functions, HTTP API, frontend S3 bucket)
```

![Architecture overview](docs/images/architecture-excalidraw.png)

## Prerequisites

**To just look at the frontend:**

- Node.js 24.x (`.nvmrc` pins this)
- Corepack enabled (`corepack enable`), manages the pinned Yarn Berry version, see `package.json`

**To run the full stack locally (API + detector):** everything above, plus:

- Python 3.13, managed with `pyenv`, scoped to `services/detector`

The `opencv` path needs no AWS. `strategy=textract` calls real AWS Textract, so exercising it (locally or deployed) needs AWS credentials - see **Running locally**.

**To deploy:**

- A real AWS account and a configured AWS CLI/SSO profile
- Docker Desktop, only needed here, to build the detector's container image for ECR

## Setup

```bash
git clone https://github.com/geomus/checkbox-detection-service.git
cd checkbox-detection-service
corepack enable
yarn install

# detector Python environment (needed for local dev and `yarn test`)
cd services/detector
python -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
cd ../..
```

## Running locally

```bash
yarn dev
```

Runs the whole stack together: the web app (Vite, on `:5173`, already pointed at the
local API), `serverless-offline` (the API, on `:3000`) and the detector's local
Python shim (`:8000`). Open http://localhost:5173, or hit the API directly:

```bash
curl -F file=@docs/challenge/sample-images/document-1.jpg http://localhost:3000/detect
```

`strategy=textract` calls real AWS Textract (no local stub). To exercise it locally, run
`aws sso login --profile <profile>` then `AWS_PROFILE=<profile> yarn dev`; plain `yarn dev`
stubs the credentials, so only the `opencv` path works.

## Testing

```bash
yarn test
```

Runs every workspace's tests plus the detector's `pytest` suite. The detector venv
from **Setup** must exist first.

## Deployment

```bash
yarn deploy
```

`scripts/deploy.mjs` runs the whole thing:

1. builds the API bundle and runs `serverless deploy` - the Node API (zip), the
   Python detector (container image) and the frontend's S3 bucket, one
   CloudFormation stack;
2. reads the stack outputs, builds `apps/web` with `VITE_API_URL` pointed at the
   deployed API, and `aws s3 sync`s it to the bucket;
3. prints the live frontend URL.

Needs Docker running (for the detector image) and AWS credentials - `aws sso login
--profile personal`, or set `AWS_PROFILE`. See
`docs/adr/0001-initial-architecture-decisions.md`.

The frontend is a plain S3 static website (HTTP). Fronting it with CloudFront for
HTTPS and a custom domain is a deliberate TODO, not done here.

Each deploy builds and pushes a new detector image. The ECR repo has a lifecycle
rule that keeps the last 3 and expires the rest; `docker image prune -f` clears
the local build layers.

## API contract

```
POST /detect
```

Multipart upload: `file` (the image), optional `strategy` (`opencv` default, or
`textract`), and (for `textract` only) the image's pixel `width` and `height`.
`strategy=textract` can be disabled server-side; see
[docs/detection-approach.md](docs/detection-approach.md).

```json
{
  "boxes": [
    { "bbox": [x1, y1, x2, y2], "is_checked": true },
    { "bbox": [x1, y1, x2, y2], "is_checked": false }
  ]
}
```

## Architecture decisions

- [ADR-0001: Initial architecture decisions](docs/adr/0001-initial-architecture-decisions.md)
- [ADR-0002: Build, buy, or train the checkbox detector](docs/adr/0002-checkbox-detection-build-vs-buy.md)
- [ADR-0003: Frontend component approach](docs/adr/0003-frontend-component-approach.md)

## Approach, trade-offs and limitations

See [docs/detection-approach.md](docs/detection-approach.md).

## Notes

I used AI assistance selectively, mostly to speed up the mechanical parts - the
Python detector (a stack I don't work in daily), request validation, the test
suites, and the `scripts/` / `serverless.yml` wiring. I reviewed every line and
made the final calls on what landed.

The architecture and the trade-offs are mine: the functional core / imperative
shell split, the Node/TypeScript vs Python boundary, the hybrid `opencv` /
`textract` detector behind one interface, and what to leave out. `docs/adr/` has
the reasoning.

The classical-CV pipeline follows FuzzyLabs' *Checkbox Detection with OpenCV*
guide (linked from [`services/detector/README.md`](services/detector/README.md)).

`yarn npm audit` reports a few advisories inside the `serverless` v3 CLI's own
dependency tree - dev tooling only, none of it ships in the deployed Lambda or the
Python image.

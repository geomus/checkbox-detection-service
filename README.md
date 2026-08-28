# Checkbox Detection Service

Detects and classifies checkboxes (filled or unfilled) in scanned document images. Built as a take-home technical challenge.

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
serverless.yml  Serverless Framework config (both functions + frontend bucket)
```

![Architecture overview](docs/images/architecture-excalidraw.png)

## Prerequisites

**To just look at the frontend:**

- Node.js 24.x (`.nvmrc` pins this)
- Corepack enabled (`corepack enable`), manages the pinned Yarn Berry version, see `package.json`

**To run the full stack locally (API + detector):** everything above, plus:

- Python 3.13, managed with `pyenv`, scoped to `services/detector`
- Some AWS credentials present in the environment, even placeholder ones (e.g. `AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local`). `serverless-offline` checks that _something_ is configured at startup, but the default `opencv` detection path never calls real AWS. (`strategy=textract` does, see the API contract below.)

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

Runs `serverless-offline` (the API, on `:3000`) and the detector's local Python
shim (`:8000`) together. Then:

```bash
curl -F file=@docs/challenge/sample-images/document-1.jpg http://localhost:3000/detect
```

## Testing

```bash
yarn test
```

Runs the frontend unit tests (Vitest) and the detector suite (`pytest` against the
four sample forms). The detector venv from **Setup** must exist first.

## Deployment

```bash
yarn deploy
```

Builds the workspaces and runs `serverless deploy`: both Lambda functions (the
Node API zip and the Python detector container image) and the frontend's S3
bucket, in one CloudFormation stack. See `docs/adr/0001-initial-architecture-decisions.md`.

## API contract

```
POST /detect
```

Multipart upload: `file` (the image), optional `strategy` (`opencv` default, or
`textract`), and (for `textract` only) the image's pixel `width` and `height`.
`strategy=textract` can be switched off server-side with the `TEXTRACT_ENABLED`
env var (returns `503`); see [docs/detection-approach.md](docs/detection-approach.md).

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

## Approach, trade-offs and limitations

See [docs/detection-approach.md](docs/detection-approach.md).

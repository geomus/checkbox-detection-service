# Checkbox Detection Service

Detects and classifies checkboxes (filled or unfilled) in scanned document images. Built as a take-home technical challenge.

## Project structure

```
apps/
  api/        Node.js + TypeScript + Hono API (AWS Lambda)
  web/        React + Vite + TypeScript frontend
services/
  detector/   Python + OpenCV checkbox detection
infra/        Serverless Framework config
docs/
  adr/        Architecture decision records
  challenge/  Original brief + sample images
```

![Architecture overview](docs/images/architecture-excalidraw.png)

## Prerequisites

**To just look at the frontend:**

- Node.js 24.x (`.nvmrc` pins this)
- Corepack enabled (`corepack enable`), manages the pinned Yarn Berry version, see `package.json`
  **To run the full stack locally (API + detector):** everything above, plus:
- Python 3.13, managed with `pyenv`, scoped to `services/detector`
- Some AWS credentials present in the environment — even placeholder ones (e.g. `AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local`). `serverless-offline` and the Serverless Framework CLI check that _something_ is configured at startup, but nothing in local dev ever calls real AWS. **No real AWS account is needed to develop or run this locally.**
  **To deploy:**
- A real AWS account and a configured AWS CLI/SSO profile
- Docker Desktop, only needed here, to build the detector's container image for ECR

## Setup

```bash
git clone <repo-url> // TODO: add repo URL
cd checkbox-detection-service
corepack enable
yarn install
```

TODO: `services/detector` Python environment setup (pyenv + venv) once that package has real code.

## Running locally

TODO — not implemented yet. The API will run through `serverless-offline`, the detector through a small local Python dev server. `apps/web` alone is already runnable:

```bash
yarn workspace web run dev
```

## Testing

TODO — not implemented yet.

## Deployment

TODO — not implemented yet. Will be a single `yarn deploy` covering both Lambda functions and the frontend's S3 bucket — see `docs/adr/0001-initial-architecture-decisions.md`.

## API contract

```
POST /detect
```

Input: an image file upload.

Output:

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

## Approach, trade-offs and limitations

TBD — written up once the detector is implemented and tested against the sample images in `docs/challenge/sample-images/`.

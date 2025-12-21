# Grader Mock

This lightweight worker consumes the `grader.submissions` RabbitMQ queue and
responds like the production SolidWorks grader. It was built for E2E tests and
CI environments where the full grader stack is unavailable.

## Running locally

```bash
node grader-mock/index.js
```

Environment variables:

- `RABBITMQ_URL` – connection string (defaults to `amqp://guest:guest@localhost:5672`).
- `GRADER_QUEUE_NAME` – queue to consume (defaults to `grader.submissions`).
- `WEB_API_BASE_URL` / `GRADER_RESULT_BASE_URL` – base URL for callback API.
- `GRADER_BASE_URL` – health endpoint the web API polls (defaults to `http://localhost:3999`).
- `GRADER_SHARED_SECRET` – optional shared secret header for callbacks.
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_BUCKET`, `AWS_REGION`
  (and optionally `AWS_ENDPOINT`, `AWS_FORCE_PATH_STYLE`, `AWS_PUBLIC_BASE_URL`)
  – required if you want mock fixtures to upload screenshots to a MinIO/S3
  bucket.

The process also exposes a `/healthz` endpoint on `GRADER_BASE_URL` so the web
API keeps reporting the grader as healthy.

## Fixtures

Responses are stored in `grader-mock/fixtures` and looked up by file name
(without extension). For example, uploading `hw2.4.SLDPRT` loads
`grader-mock/fixtures/hw2.4.json`. If no match exists the mock reports a failure
back to the API.

A fixture can contain the measurement payload and optional `delayMs` to simulate
processing time:

```json
{
  "delayMs": 500,
  "volume": 12345.67,
  "surfaceArea": 890.12,
  "screenshot": "data:image/png;base64,...",
  "featureTree": { "features": [] }
}
```

For analyzer ("prescan") jobs the same fixture is returned via the queue RPC.

### Screenshot uploads

If a fixture includes `imageb64` (or `imageB64`) the mock uploads that image to
S3 before responding. The base64 value can be either a raw string or a data URL
(`data:image/png;base64,...`). When the upload succeeds, the mock still returns
the base64 screenshot to the API, but it also includes `screenshotKey` and
`screenshotUrl` fields in the payload so you can reference the uploaded asset
in tests if needed.
```

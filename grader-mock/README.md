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

```

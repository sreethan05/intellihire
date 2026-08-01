# Operations Guide

## Production prerequisites

- Set a unique `JWT_SECRET` of at least 32 characters.
- Set `APP_URL` and `CORS_ALLOWED_ORIGINS` to the deployed frontend origin.
- Set `S3_BUCKET_NAME` and non-default object-storage credentials.
- Configure a private `JUDGE0_API_URL`; public Judge0 is blocked in production.
- Set `SENTRY_DSN` to capture unhandled backend exceptions.

## Deploying

1. Build the image with `docker build -t intellihire:latest .`.
2. Provide all production environment variables through the deployment platform's secret manager.
3. Run database migrations as part of application startup; monitor startup logs for migration failures.
4. Confirm `GET /api/health` reports PostgreSQL as healthy before routing traffic.

## Monitoring and recovery

- Preserve the `X-Request-ID` response header when reporting API failures.
- Alert on `5xx` responses, storage upload failures, migration failures, and Judge0 configuration errors.
- Back up PostgreSQL and object storage regularly; test restoration before relying on backups.
- Configure lifecycle rules for uploaded resumes, offer letters, and proctoring artifacts to meet your retention policy.

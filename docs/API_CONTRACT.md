# API Contracts & Standard Response Envelopes

The active Python/FastAPI backend keeps the existing frontend contract. Most endpoints return route-specific JSON payloads directly, such as `{ "user": ... }`, `{ "exams": [...] }`, `{ "summary": [...] }`, or `{ "error": "..." }` for legacy-compatible failures.

---

## 1. Success Response Envelope

Every successful API request must return an HTTP status code between `200` and `299` and a JSON body with the shape expected by the matching frontend API helper.

**Format:**
```json
{
  "user": {}
}
```

### Example (Candidate Profile Retrieval)
**Endpoint:** `GET /api/candidate/profile`
**Response:**
```json
{
  "user": {
    "id": "cnd_9812",
    "name": "Jane Doe",
    "email": "jane@example.com"
  },
  "profile": {}
}
```

---

## 2. Error Response Envelope

Every failed API request should return an appropriate HTTP status code (`4xx` or `5xx`). FastAPI validation failures may use the framework `detail` shape; legacy-compatible routes may return a flat `error` string.

**Format:**
```json
{
  "error": "Human readable description of the error"
}
```

### Common Error Codes & Codes Mapping
- `400 Bad Request` -> `VALIDATION_ERROR` (e.g. invalid request body formats)
- `401 Unauthorized` -> `UNAUTHORIZED` (e.g. missing token, invalid signature)
- `403 Forbidden` -> `FORBIDDEN` (e.g. role mismatch)
- `404 Not Found` -> `NOT_FOUND` (e.g. record or route does not exist)
- `429 Too Many Requests` -> `RATE_LIMIT_EXCEEDED`
- `500 Internal Server Error` -> `INTERNAL_ERROR`

### Example (Validation Failure)
**Endpoint:** `POST /api/exam/create`
**Response:**
```json
{
  "detail": "Title is required"
}
```

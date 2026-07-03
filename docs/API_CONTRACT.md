# API Contracts & Standard Response Envelopes

All endpoints in Intellihire must adhere to the standard API response structure outlined below.

---

## 1. Success Response Envelope

Every successful API request must return an HTTP status code between `200` and `299`, and include the payload inside the `data` wrapper.

**Format:**
```json
{
  "success": true,
  "data": {}
}
```

### Example (Candidate Profile Retrieval)
**Endpoint:** `GET /api/candidate/profile`
**Response:**
```json
{
  "success": true,
  "data": {
    "id": "cnd_9812",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "college": "Oxford Institute of Technology"
  }
}
```

---

## 2. Error Response Envelope

Every failed API request must return an appropriate HTTP status code (`4xx` or `5xx`), and wrap error information inside the `error` object. The error response must include a unique `requestId` to simplify server logging correlation.

**Format:**
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE_STRING",
    "message": "Human readable description of the error",
    "requestId": "uuid-v4-request-correlation-id",
    "details": []
  }
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
**Endpoint:** `POST /api/exams/create`
**Response:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed for exam parameters",
    "requestId": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
    "details": [
      {
        "field": "title",
        "issue": "Title is required"
      }
    ]
  }
}
```

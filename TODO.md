# TODO - Redis graceful degradation

- [x] Update `server/src/lib/queue.ts` to avoid process crash when Redis/Bull is unreachable; keep local/disk fallback queue.
- [x] Update `server/src/websocket.ts` to keep Socket.IO working without Redis adapter when Redis is unavailable; preserve auth + rooms.
- [x] Restart server and verify:
  - [x] `GET /api/health` returns 200/503 without crashing
  - [x] Client can load UI and make API calls
  - [x] No repeated `MaxRetriesPerRequestError` crash loop when Redis is offline



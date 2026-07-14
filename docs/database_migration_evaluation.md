# Database Driver Migration Evaluation: psycopg2 vs psycopg3 vs asyncpg

## Context
The current implementation of the database module (`db.py`) utilizes `psycopg2`'s `ThreadedConnectionPool` combined with `asyncio.to_thread` to prevent database operations from blocking FastAPI's async event loop. Under high concurrency, this approach can suffer from pool exhaustion, high thread overhead, or thread contention.

This document evaluates migrating the backend database client to a fully async-native driver.

---

## 1. Candidate Comparison

| Metric / Feature | psycopg2 (Current) | psycopg3 (psycopg) | asyncpg |
| :--- | :--- | :--- | :--- |
| **Model** | Synchronous | Async/Sync Dual-Native | Async-Only |
| **Performance** | Moderate (threaded overhead) | Fast | Extremely Fast |
| **Protocol** | Standard Postgres protocol | Standard protocol + binary | Binary protocol |
| **Query Formatting** | `%s` placeholders | `%s` or `%(name)s` placeholders | `$1, $2` positional parameters |
| **SQL Compatibility** | Standard SQL | Standard SQL | Strict protocol rules (e.g. multi-statement commands can be limited) |
| **Connection Pooling** | `ThreadedConnectionPool` | Native `AsyncConnectionPool` | Native `Pool` |
| **Implementation Effort** | N/A | Low (psycopg3 is backwards compatible with `%s` and cursor structures) | High (requires SQL rewrite to `$1` format and different return formats) |

---

## 2. Recommended Path: psycopg3 (psycopg)

We recommend migrating from `psycopg2` to `psycopg` (v3) rather than `asyncpg` for the following reasons:
1. **Placeholder Compatibility**: `psycopg3` natively supports the `%s` format and dictionary/named parameters. `asyncpg` enforces the `$1`, `$2` positional format, which would require rewriting every SQL query in the entire application.
2. **Backwards Compatibility**: `psycopg3` provides a sync/async dual API, making the migration path gradual.
3. **Connection Pooling**: `psycopg-pool` provides a robust, native `AsyncConnectionPool` that integrates seamlessly with asyncio.

---

## 3. Migration Roadmap (Refactoring db.py)

To migrate `db.py` to `psycopg3` async-native code:

### Step 1: Install Dependencies
Replace `psycopg2-binary` with `psycopg` and `psycopg-pool` in `requirements.txt`:
```txt
psycopg[binary]>=3.1.0
psycopg-pool>=3.1.0
```

### Step 2: Initialize Async Pool
```python
from psycopg_pool import AsyncConnectionPool

pool = AsyncConnectionPool(
    conninfo=DATABASE_URL,
    min_size=1,
    max_size=20,
    open=False  # Initialize connection pool asynchronously on startup
)
```

### Step 3: Implement Async Connection Manager
```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def get_connection():
    async with pool.connection() as conn:
        yield conn
```

### Step 4: Refactor `DBBuilder` to use `async with`
All sync cursor execution methods inside `_sync_execute` would be migrated to async methods:
```python
async def _async_execute(self) -> QueryResponse:
    async with get_connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(sql, params)
            rows = await cur.fetchall()
            return QueryResponse(data=rows)
```

### Step 5: Refactor transaction helper
```python
async def transaction(func):
    async with get_connection() as conn:
        async with conn.transaction():
            return await func(conn)
```

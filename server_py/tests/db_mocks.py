"""Shared mock harness for testing route coroutines against the ``db`` builder.

The application talks to Postgres through a hand-rolled fluent query builder
(``app.db``). Unit tests call route coroutines directly with a mocked ``db``
object whose ``from_(table)`` returns pre-configured query chains.

Three composition styles are supported:

- ``db_routing({...})`` — one chain per table (most endpoints).
- ``sequence_db(q1, q2, ...)`` — chains consumed in call order (endpoints that
  hit the same table multiple times).
- ``fake_connection([...])`` — patches raw-psycopg ``get_connection()`` blocks:
  each ``execute()`` consumes the next result set.
"""
from collections import deque
from contextlib import contextmanager
from unittest.mock import MagicMock

CHAIN_METHODS = (
    "select", "eq", "neq", "in_", "is_", "is_not", "or_", "order", "limit",
    "single", "maybeSingle", "update", "insert", "upsert", "delete",
    "gte", "gt", "lte", "lt", "like", "ilike", "range", "execute",
)


class Awaitable(MagicMock):
    """A MagicMock whose instances can be awaited, returning ``await_result``."""

    def __init__(self, await_result=None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._await_result = await_result

    def __await__(self):
        async def _async_func():
            return self._await_result
        return _async_func().__await__()


def query(data=None, error=None, count=None):
    """Mock one ``db.from_(...)`` query builder chain.

    The mock is awaitable (returning itself), so both ``res = await chain``
    and ``chain.error = ...`` styles behave consistently in tests.
    """
    mock = Awaitable()
    mock._await_result = mock
    mock.data = data
    mock.error = error
    mock.count = count
    for name in CHAIN_METHODS:
        getattr(mock, name).return_value = mock
    return mock


def db_routing(routes):
    """Return a db mock whose ``from_(table)`` returns ``routes[table]``."""
    mock_db = MagicMock()
    mock_db.from_.side_effect = lambda table: routes.get(table, query(data=[]))
    return mock_db


def sequence_db(*queries):
    """Return a db mock handing out ``queries`` in call order."""
    mock_db = MagicMock()
    mock_db.from_.side_effect = list(queries)
    return mock_db


class FakeCursor:
    """Minimal psycopg cursor stand-in: one result set per ``execute()``."""

    def __init__(self, result_sets):
        self._results = deque(result_sets)
        self.current = []
        self.executed = []

    def execute(self, sql, params=None):
        self.executed.append((sql, params))
        self.current = self._results.popleft() if self._results else []
        return self

    def fetchall(self):
        return list(self.current)

    def fetchone(self):
        return self.current[0] if self.current else None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class FakeConn:
    def __init__(self, result_sets):
        self._cursor = FakeCursor(result_sets)

    def cursor(self, **kwargs):
        return self._cursor

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


@contextmanager
def fake_connection(result_sets):
    """Context manager emulating ``app.db.get_connection()``."""
    yield FakeConn(result_sets)

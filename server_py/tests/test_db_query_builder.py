"""Unit tests for the hand-rolled Supabase-style query builder in ``app.db``.

These tests exercise the builder itself — SQL text, bound parameter lists and
result normalization — against fake connections. No real database, no network,
no sleeps: every result set is replayed deterministically.

``tests/db_mocks.FakeCursor`` supplies the cursor primitive; ``StubConn`` wraps
it and adds the ``commit()``/``rollback()`` hooks the mutation paths need.
``run_builder`` swaps ``app.db.get_connection`` for a fresh stub connection.
"""
import asyncio
import uuid
from contextlib import contextmanager
from datetime import datetime
from unittest.mock import patch

import pytest

from app import db as db_module
from app.db import (
    DBBuilder,
    QueryError,
    QueryResponse,
    assert_identifier,
    close_pool,
    db,
    find_matching_paren,
    get_connection,
    get_pool,
    normalize_identifier,
    normalize_row_values,
    parse_select,
    quote_identifier,
    relation_for_alias,
    relation_for_column,
    relation_for_target,
    split_top_level,
    transaction,
)
from tests.db_mocks import FakeCursor


# ---------------------------------------------------------------------------
# Fakes and helpers
# ---------------------------------------------------------------------------
class StubConn:
    """A recording connection: db_mocks.FakeCursor plus commit/rollback hooks."""

    def __init__(self, result_sets=(), cursor=None, rollback_error=None):
        self._cursor = cursor if cursor is not None else FakeCursor(list(result_sets))
        self.commits = 0
        self.rollbacks = 0
        self.rollback_error = rollback_error

    def cursor(self, **kwargs):
        return self._cursor

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1
        if self.rollback_error is not None:
            raise self.rollback_error

    @property
    def executed(self):
        return self._cursor.executed


class FailingCursor(FakeCursor):
    """Cursor whose ``execute`` raises, to test error propagation."""

    def __init__(self, error):
        super().__init__([])
        self._error = error

    def execute(self, sql, params=None):
        self.executed.append((sql, params))
        raise self._error


class FakePool:
    """Minimal stand-in for psycopg_pool.ConnectionPool."""

    def __init__(self, conninfo=None, min_size=None, max_size=None, open=False, conn=None):
        self.conninfo = conninfo
        self.min_size = min_size
        self.max_size = max_size
        # psycopg: a freshly constructed (even unopened) pool is not "closed".
        self.closed = False
        self.conn = conn
        self.open_calls = 0
        self.close_calls = 0

    def open(self):
        self.open_calls += 1
        self.closed = False

    def close(self):
        self.close_calls += 1
        self.closed = True

    @contextmanager
    def connection(self):
        yield self.conn


@contextmanager
def _ctx(conn):
    yield conn


def run_builder(builder, *result_sets, conn=None):
    """Run ``builder._sync_execute()`` against a stub connection."""
    conn = conn if conn is not None else StubConn(result_sets)
    with patch.object(db_module, "get_connection", new=lambda: _ctx(conn)):
        response = builder._sync_execute()
    return response, conn


# ---------------------------------------------------------------------------
# Pool / connection lifecycle
# ---------------------------------------------------------------------------
def test_get_pool_creates_lazily_and_reopens_closed_pool():
    with patch.object(db_module, "_pool", None), patch.object(db_module, "ConnectionPool", FakePool):
        pool = get_pool()
        assert isinstance(pool, FakePool)
        assert (pool.min_size, pool.max_size) == (1, 20)
        assert pool.closed is False  # constructed with open=False -> not reopened yet
        assert pool.open_calls == 0
        assert get_pool() is pool
        assert pool.open_calls == 0
        pool.closed = True
        assert get_pool() is pool
        assert pool.open_calls == 1


def test_close_pool_closes_open_pool_and_is_noop_when_none_or_closed():
    with patch.object(db_module, "_pool", None):
        close_pool()  # nothing to close

    open_pool = FakePool()
    with patch.object(db_module, "_pool", open_pool):
        close_pool()
    assert open_pool.close_calls == 1

    closed_pool = FakePool()
    closed_pool.closed = True
    with patch.object(db_module, "_pool", closed_pool):
        close_pool()
    assert closed_pool.close_calls == 0


def test_get_connection_yields_and_rolls_back_on_failure():
    conn = StubConn([])
    with patch.object(db_module, "get_pool", return_value=FakePool(conn=conn)):
        with get_connection() as yielded:
            assert yielded is conn
        assert conn.rollbacks == 0

        with pytest.raises(RuntimeError, match="body failed"):
            with get_connection():
                raise RuntimeError("body failed")
    assert conn.rollbacks == 1


def test_get_connection_swallows_rollback_failure_but_reraises_original():
    conn = StubConn([], rollback_error=AttributeError("conn is gone"))
    with patch.object(db_module, "get_pool", return_value=FakePool(conn=conn)):
        with pytest.raises(RuntimeError, match="original failure"):
            with get_connection():
                raise RuntimeError("original failure")
    assert conn.rollbacks == 1  # rollback was attempted once and swallowed


def test_transaction_commits_and_rolls_back():
    conn = StubConn([])
    seen = []

    def work(c):
        seen.append(c)
        return {"ok": True}

    with patch.object(db_module, "get_connection", new=lambda: _ctx(conn)):
        assert asyncio.run(transaction(work)) == {"ok": True}
    assert seen == [conn]
    assert conn.commits == 1

    def boom(_c):
        raise ValueError("tx boom")

    with patch.object(db_module, "get_connection", new=lambda: _ctx(conn)):
        with pytest.raises(ValueError, match="tx boom"):
            asyncio.run(transaction(boom))
    assert conn.rollbacks == 1


# ---------------------------------------------------------------------------
# Entry point, selects, filters, paging
# ---------------------------------------------------------------------------
def test_db_from_returns_builder_for_table():
    builder = db.from_("jobs")
    assert isinstance(builder, DBBuilder)
    assert builder.table == "jobs"
    assert builder.operation == "select"


def test_select_projects_sorted_columns():
    builder = DBBuilder("attempts").select("status, id")
    response, conn = run_builder(builder, [{"id": 1, "status": "active", "ignored": "x"}])
    assert conn.executed[0] == ('SELECT "id", "status" FROM "attempts"', [])
    assert response.data == [{"id": 1, "status": "active"}]
    assert response.error is None
    assert response.count is None


def test_select_star_and_unparsable_columns():
    response, conn = run_builder(DBBuilder("attempts").select(""), [{"id": 1}])
    assert conn.executed[0] == ('SELECT * FROM "attempts"', [])
    assert response.data == [{"id": 1}]

    response, conn = run_builder(DBBuilder("attempts").select(","), [{"id": 9}])
    assert conn.executed[0] == ('SELECT "id" FROM "attempts"', [])
    # No bare columns were parsable, so the projected row is empty.
    assert response.data == [{}]

    _, conn = run_builder(DBBuilder("attempts").select(), [])
    assert conn.executed[0][0] == 'SELECT * FROM "attempts"'


@pytest.mark.parametrize(
    ("method", "value", "where", "params"),
    [
        ("eq", 5, '"status" = %s', [5]),
        ("eq", None, '"status" IS NULL', []),
        ("neq", 5, '"status" <> %s', [5]),
        ("neq", None, '"status" IS NOT NULL', []),
        ("is_", None, '"status" IS NULL', []),
        ("is_", True, '"status" IS %s', [True]),
        ("is_not", None, '"status" IS NOT NULL', []),
        ("is_not", False, '"status" IS NOT %s', [False]),
        ("gt", 1, '"status" > %s', [1]),
        ("gte", 1, '"status" >= %s', [1]),
        ("lt", 1, '"status" < %s', [1]),
        ("lte", 1, '"status" <= %s', [1]),
        ("like", "%a%", '"status" LIKE %s', ["%a%"]),
        ("ilike", "%a%", '"status" ILIKE %s', ["%a%"]),
    ],
)
def test_filter_operators_build_sql_and_params(method, value, where, params):
    builder = DBBuilder("attempts").select("id")
    getattr(builder, method)("status", value)
    _, conn = run_builder(builder, [])
    assert conn.executed[0] == (f'SELECT "id" FROM "attempts" WHERE {where}', params)


@pytest.mark.parametrize(
    ("values", "where", "params"),
    [
        ([1, 2, 3], '"id" IN (%s, %s, %s)', [1, 2, 3]),
        ([], "FALSE", []),
        (None, "FALSE", []),
    ],
)
def test_in_filter_variants(values, where, params):
    builder = DBBuilder("attempts").select("*").in_("id", values)
    _, conn = run_builder(builder, [])
    assert conn.executed[0] == (f'SELECT * FROM "attempts" WHERE {where}', params)


def test_multiple_filters_are_anded_and_trimmed():
    builder = (
        DBBuilder("attempts")
        .select("*")
        .eq(" status ", "done")
        .gt("score", 10)
        .in_("id", [1, 2])
    )
    _, conn = run_builder(builder, [])
    assert conn.executed[0] == (
        'SELECT * FROM "attempts" WHERE "status" = %s AND "score" > %s AND "id" IN (%s, %s)',
        ["done", 10, 1, 2],
    )


def test_order_by_asc_and_desc():
    builder = DBBuilder("attempts").select("*").order("created_at", ascending=False).order("id")
    _, conn = run_builder(builder, [])
    assert conn.executed[0] == ('SELECT * FROM "attempts" ORDER BY "created_at" DESC, "id" ASC', [])


def test_limit_and_range():
    _, conn = run_builder(DBBuilder("attempts").select("*").range(20, 29), [])
    assert conn.executed[0] == ('SELECT * FROM "attempts" LIMIT %s OFFSET %s', [10, 20])

    _, conn = run_builder(DBBuilder("attempts").select("*").limit(5), [])
    assert conn.executed[0] == ('SELECT * FROM "attempts" LIMIT %s', [5])


def test_single_returns_dict_and_sets_default_limit():
    builder = DBBuilder("attempts").select("id").eq("id", 1).single()
    response, conn = run_builder(builder, [{"id": 1}])
    assert response.data == {"id": 1}
    assert response.error is None
    assert conn.executed[0] == ('SELECT "id" FROM "attempts" WHERE "id" = %s LIMIT %s', [1, 1])


def test_single_cardinality_errors_become_query_errors():
    response, _ = run_builder(DBBuilder("attempts").select("id").single(), [])
    assert response.data is None
    assert response.error is not None
    assert response.error.message == "The result contains 0 rows"

    response, _ = run_builder(DBBuilder("attempts").select("id").single(), [{"id": 1}, {"id": 2}])
    assert response.error.message == "The result contains multiple rows"


def test_maybe_single_none_dict_and_explicit_limit():
    response, _ = run_builder(DBBuilder("attempts").select("id").maybeSingle(), [])
    assert response.data is None
    assert response.error is None

    response, _ = run_builder(DBBuilder("attempts").select("id").maybeSingle(), [{"id": 1}])
    assert response.data == {"id": 1}

    builder = DBBuilder("attempts").select("id").limit(3).maybeSingle()
    _, conn = run_builder(builder, [{"id": 1}])
    assert conn.executed[0][1] == [3]  # explicit limit is not overwritten with 1


def test_count_exact_runs_count_then_rows():
    builder = DBBuilder("attempts").select("id", count="exact").eq("status", "done")
    response, conn = run_builder(builder, [{"count": 7}], [{"id": 1}])
    assert response.count == 7
    assert response.data == [{"id": 1}]
    assert conn.executed[0] == ('SELECT COUNT(*) AS count FROM "attempts" WHERE "status" = %s', ["done"])
    assert conn.executed[1] == ('SELECT "id" FROM "attempts" WHERE "status" = %s', ["done"])


def test_head_skips_row_fetch_and_reports_count():
    builder = DBBuilder("attempts").select("*", count="exact", head=True)
    response, conn = run_builder(builder, [{"count": 3}])
    assert response.data == []
    assert response.count == 3
    assert len(conn.executed) == 1
    assert conn.executed[0][0] == 'SELECT COUNT(*) AS count FROM "attempts"'


# ---------------------------------------------------------------------------
# OR filters and related-column filters
# ---------------------------------------------------------------------------
def test_or_filter_builds_disjunction_after_regular_filters():
    builder = DBBuilder("attempts").select("*").eq("status", "pending").or_("status.eq.active,score.gt.10")
    _, conn = run_builder(builder, [])
    assert conn.executed[0] == (
        'SELECT * FROM "attempts" WHERE "status" = %s AND ("status" = %s OR "score" > %s)',
        ["pending", "active", "10"],
    )


def test_or_filter_coerces_literals_and_in_list():
    builder = DBBuilder("attempts").select("*").or_("a.eq.null,b.eq.true,c.eq.false,d.in.(1,2)")
    _, conn = run_builder(builder, [])
    assert conn.executed[0] == (
        'SELECT * FROM "attempts" WHERE ("a" IS NULL OR "b" = %s OR "c" = %s OR "d" IN (%s, %s))',
        [True, False, "1", "2"],
    )


def test_or_filter_edge_cases():
    builder = DBBuilder("attempts").select("*").or_("garbage")
    assert builder._build_where() == ("", [])
    _, conn = run_builder(builder, [])
    assert conn.executed[0] == ('SELECT * FROM "attempts"', [])

    bad = DBBuilder("attempts").select("*").or_("a.regex.1")
    with pytest.raises(ValueError, match="Unsupported filter operator: regex"):
        bad._build_where()


def test_related_column_filter_uses_subquery():
    builder = DBBuilder("attempts").select("id").eq("exam.id", 5)
    _, conn = run_builder(builder, [])
    assert conn.executed[0] == (
        'SELECT "id" FROM "attempts" WHERE "exam_id" IN '
        '(SELECT "id" FROM "exams" WHERE "id" = %s)',
        [5],
    )


def test_filter_validation_errors():
    with pytest.raises(ValueError, match="No relation mapping from attempts for filter nope.id"):
        DBBuilder("attempts").select("id").eq("nope.id", 1)._build_where()

    with pytest.raises(ValueError, match="Unsupported filter operator: regex"):
        DBBuilder("attempts")._filter_to_sql("col", "regex", 1)


# ---------------------------------------------------------------------------
# Inserts and upserts
# ---------------------------------------------------------------------------
def test_insert_single_dict_commits_and_returns_rows():
    builder = DBBuilder("attempts").insert({"name": "a", "id": 1})
    response, conn = run_builder(builder, [{"id": 1, "name": "a"}])
    assert conn.executed[0] == (
        'INSERT INTO "attempts" ("id", "name") VALUES (%s, %s) RETURNING *',
        [1, "a"],
    )
    assert conn.commits == 1
    assert response.data == [{"id": 1, "name": "a"}]


def test_insert_list_union_columns_with_null_fill():
    builder = DBBuilder("attempts").insert([{"id": 1, "name": "a"}, {"id": 2, "score": 5}])
    _, conn = run_builder(builder, [])
    assert conn.executed[0] == (
        'INSERT INTO "attempts" ("id", "name", "score") VALUES (%s, %s, %s), (%s, %s, %s) RETURNING *',
        [1, "a", None, 2, None, 5],
    )


@pytest.mark.parametrize("payload", [None, [], [None], [{}]])
def test_insert_empty_payload_is_noop(payload):
    response, conn = run_builder(DBBuilder("attempts").insert(payload))
    assert response.data == []
    assert response.error is None
    assert conn.executed == []
    assert conn.commits == 0


def test_insert_single_projection_and_uuid_normalization():
    uid = uuid.uuid4()
    builder = DBBuilder("attempts").insert({"id": uid, "name": "a"}).select("id").single()
    response, conn = run_builder(builder, [{"id": uid, "name": "a"}])
    assert builder.has_returning is True
    assert response.data == {"id": str(uid)}
    assert conn.commits == 1


def test_upsert_default_does_update_excluded():
    builder = DBBuilder("attempts").upsert({"id": 1, "name": "a", "score": 2})
    _, conn = run_builder(builder, [])
    assert conn.executed[0] == (
        'INSERT INTO "attempts" ("id", "name", "score") VALUES (%s, %s, %s) '
        'ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "score" = EXCLUDED."score" RETURNING *',
        [1, "a", 2],
    )


def test_upsert_ignore_duplicates_and_multi_column_conflict():
    builder = DBBuilder("attempts").upsert(
        {"id": 1, "email": "a@b.c", "name": "a"},
        on_conflict="id, email",
        ignore_duplicates=True,
    )
    _, conn = run_builder(builder, [])
    assert conn.executed[0] == (
        'INSERT INTO "attempts" ("email", "id", "name") VALUES (%s, %s, %s) '
        'ON CONFLICT ("id", "email") DO NOTHING RETURNING *',
        ["a@b.c", 1, "a"],
    )


def test_upsert_only_conflict_columns_do_nothing():
    builder = DBBuilder("attempts").upsert({"id": 1})
    _, conn = run_builder(builder, [])
    assert conn.executed[0][0] == (
        'INSERT INTO "attempts" ("id") VALUES (%s) ON CONFLICT ("id") DO NOTHING RETURNING *'
    )


def test_upsert_kwargs_aliases_and_onconflict_method():
    builder = DBBuilder("attempts").upsert({"id": 1, "email": "e"}, onConflict="email", ignoreDuplicates=True)
    assert builder.on_conflict == "email"
    assert builder.ignore_duplicates is True
    _, conn = run_builder(builder, [])
    assert 'ON CONFLICT ("email") DO NOTHING' in conn.executed[0][0]

    builder2 = DBBuilder("attempts").insert({"id": 1, "email": "e"}).onConflict("email")
    _, conn2 = run_builder(builder2, [])
    assert 'ON CONFLICT ("email") DO UPDATE SET "id" = EXCLUDED."id"' in conn2.executed[0][0]


# ---------------------------------------------------------------------------
# Updates and deletes (incl. soft delete)
# ---------------------------------------------------------------------------
def test_update_builds_set_where_and_commits():
    builder = DBBuilder("attempts").update({"status": "done"}).eq("id", 7)
    response, conn = run_builder(builder, [{"id": 7, "status": "done"}])
    assert conn.executed[0] == (
        'UPDATE "attempts" SET "status" = %s WHERE "id" = %s RETURNING *',
        ["done", 7],
    )
    assert conn.commits == 1
    assert response.data == [{"id": 7, "status": "done"}]


def test_update_empty_patch_and_single_result():
    response, conn = run_builder(DBBuilder("attempts").update({}))
    assert response.data == []
    assert conn.executed == []
    assert conn.commits == 0

    builder = DBBuilder("attempts").update({"status": "done"}).eq("id", 7).select("id").single()
    response, conn = run_builder(builder, [{"id": 7}])
    assert response.data == {"id": 7}
    assert conn.commits == 1


def test_soft_delete_table_default_filter():
    builder = DBBuilder("exams").select("id")
    assert builder.filters == [("deleted_at", "is", None)]
    _, conn = run_builder(builder, [])
    assert conn.executed[0] == ('SELECT "id" FROM "exams" WHERE "deleted_at" IS NULL', [])


def test_delete_soft_delete_table_sets_deleted_at():
    builder = DBBuilder("exams").delete().eq("id", 3)
    response, conn = run_builder(builder, [{"id": 3}])
    assert conn.executed[0] == (
        'UPDATE "exams" SET deleted_at = NOW() WHERE "deleted_at" IS NULL AND "id" = %s RETURNING *',
        [3],
    )
    assert conn.commits == 1
    assert response.data == [{"id": 3}]


def test_delete_regular_table_variants():
    builder = DBBuilder("attempts").delete().eq("id", 1)
    response, conn = run_builder(builder, [{"id": 1}])
    assert conn.executed[0] == ('DELETE FROM "attempts" WHERE "id" = %s RETURNING *', [1])
    assert conn.commits == 1
    assert response.data == [{"id": 1}]

    _, conn = run_builder(DBBuilder("attempts").delete(), [])
    assert conn.executed[0] == ('DELETE FROM "attempts" RETURNING *', [])


# ---------------------------------------------------------------------------
# Relation embeds
# ---------------------------------------------------------------------------
def test_embed_hydration_queries_related_rows():
    builder = DBBuilder("attempts").select("id, exam:exam_id(id, title)")
    response, conn = run_builder(
        builder,
        [{"id": 1, "exam_id": 10}, {"id": 2, "exam_id": 10}, {"id": 3, "exam_id": 11}],
        [{"id": 10, "title": "Midterm"}, {"id": 11, "title": "Final"}],
    )
    assert conn.executed[0] == ('SELECT "exam_id", "id" FROM "attempts"', [])
    # "exams" is a soft-delete table, so the child query carries that filter.
    assert conn.executed[1] == (
        'SELECT "id", "title" FROM "exams" WHERE "deleted_at" IS NULL AND "id" IN (%s, %s)',
        [10, 11],
    )
    assert response.data == [
        {"id": 1, "exam": {"id": 10, "title": "Midterm"}},
        {"id": 2, "exam": {"id": 10, "title": "Midterm"}},
        {"id": 3, "exam": {"id": 11, "title": "Final"}},
    ]


def test_embed_without_fk_values_and_unknown_relation():
    response, conn = run_builder(
        DBBuilder("attempts").select("id, exam:exam_id(id)"),
        [{"id": 1, "exam_id": None}],
    )
    assert response.data == [{"id": 1, "exam": None}]
    assert len(conn.executed) == 1  # no child query when there is nothing to fetch

    builder = DBBuilder("attempts").select("widget:unknown_id(id)")
    response, conn = run_builder(builder, [{"id": 1, "unknown_id": 7}], [{"id": 7}])
    assert conn.executed[0] == ('SELECT "unknown_id" FROM "attempts"', [])
    assert conn.executed[1] == ('SELECT "id" FROM "widget" WHERE "id" IN (%s)', [7])
    assert response.data == [{"widget": {"id": 7}}]


# ---------------------------------------------------------------------------
# Parsing and identifier helpers
# ---------------------------------------------------------------------------
def test_parse_select_star_columns_and_whitespace():
    parsed = parse_select("*", "attempts")
    assert (parsed.include_all, parsed.columns, parsed.embeds) == (True, [], [])

    parsed = parse_select("", "attempts")
    assert parsed.include_all is True

    parsed = parse_select(" id ,  name ", "attempts")
    assert (parsed.include_all, parsed.columns) == (False, ["id", "name"])

    parsed = parse_select(",", "attempts")
    assert (parsed.include_all, parsed.columns, parsed.embeds) == (False, [], [])


def test_parse_select_embeds_resolve_relations():
    parsed = parse_select("exam(exam_id, title)", "attempts")
    assert parsed.columns == []
    embed = parsed.embeds[0]
    assert (embed.alias, embed.target_table, embed.fk_column) == ("exam", "exams", "exam_id")
    assert embed.columns == "exam_id, title"

    by_fk = parse_select("slot:exam_id(id)", "attempts").embeds[0]
    assert (by_fk.alias, by_fk.target_table, by_fk.fk_column) == ("slot", "exams", "exam_id")

    inner = parse_select("exams!inner(id)", "attempts").embeds[0]
    assert (inner.alias, inner.target_table, inner.fk_column) == ("exams", "exams", "exam_id")

    fallback = parse_select("widget:unknown_id(id)", "attempts").embeds[0]
    assert (fallback.alias, fallback.target_table, fallback.fk_column) == ("widget", "widget", "unknown_id")


def test_parse_select_rejects_bad_clauses():
    with pytest.raises(ValueError, match="No relation mapping from attempts for made_up"):
        parse_select("made_up(id)", "attempts")
    with pytest.raises(ValueError, match=r"Invalid select clause: exam\(exam_id"):
        parse_select("exam(exam_id", "attempts")


def test_split_top_level_and_matching_paren_helpers():
    assert split_top_level("a, b(c, d), e") == ["a", "b(c, d)", "e"]
    assert split_top_level("a, , b") == ["a", "b"]
    assert split_top_level("") == []
    assert find_matching_paren("a(b(c)d)e", 1) == 7
    assert find_matching_paren("a(b", 1) == -1


def test_identifier_and_relation_helpers():
    assert_identifier("valid_col1")
    with pytest.raises(ValueError, match="Invalid SQL identifier: 1bad"):
        assert_identifier("1bad")
    with pytest.raises(ValueError, match="Invalid SQL identifier"):
        quote_identifier("bad-name")
    assert normalize_identifier("  user_id  ") == "user_id"
    assert quote_identifier("user_id") == '"user_id"'

    rel = relation_for_column("attempts", "exam_id")
    assert rel is not None and rel.target_table == "exams"
    assert relation_for_column("attempts", "missing") is None
    assert relation_for_target("attempts", "users").column == "candidate_id"
    assert relation_for_target("attempts", "missing") is None
    assert relation_for_alias("attempts", "exam").target_table == "exams"
    assert relation_for_alias("attempts", "missing") is None


# ---------------------------------------------------------------------------
# Response objects, error propagation, async surface
# ---------------------------------------------------------------------------
def test_query_error_get_and_response_unpacking():
    error = QueryError("boom", "23505")
    assert error.message == "boom"
    assert error.code == "23505"
    assert str(error) == "boom"
    assert error.get("code") == "23505"
    assert error.get("missing", "default") == "default"

    response = QueryResponse(data=[1, 2], error=error, count=2)
    data, err = response
    assert data == [1, 2]
    assert err is error
    assert response.count == 2


def test_execute_error_returns_query_error_and_rolls_back():
    class DbBoom(RuntimeError):
        pgcode = "23505"

    conn = StubConn([], cursor=FailingCursor(DbBoom("duplicate key")))
    response, conn = run_builder(DBBuilder("attempts").select("id"), conn=conn)
    assert response.data is None
    assert isinstance(response.error, QueryError)
    assert response.error.message == "duplicate key"
    assert response.error.code == "23505"
    assert conn.rollbacks == 1

    conn2 = StubConn([], cursor=FailingCursor(RuntimeError("nope")))
    response2, _ = run_builder(DBBuilder("attempts"), conn=conn2)
    assert response2.error.code is None


def test_rollback_failure_propagates_and_unsupported_operation_is_error():
    conn = StubConn(
        [],
        cursor=FailingCursor(RuntimeError("query failed")),
        rollback_error=ValueError("rollback failed"),
    )
    with pytest.raises(ValueError, match="rollback failed"):
        run_builder(DBBuilder("attempts"), conn=conn)

    builder = DBBuilder("attempts")
    builder.operation = "merge"
    response, conn = run_builder(builder)
    assert response.error.message == "Unsupported operation: merge"
    assert conn.rollbacks == 1


def test_builder_is_awaitable_over_async_execute():
    builder = DBBuilder("attempts").select("id")
    conn = StubConn([[{"id": 1}]])

    async def go():
        with patch.object(db_module, "get_connection", new=lambda: _ctx(conn)):
            return await builder

    response = asyncio.run(go())
    assert response.data == [{"id": 1}]


def test_normalize_row_values_uuid_and_datetime_passthrough():
    uid = uuid.uuid4()
    now = datetime(2026, 1, 2, 3, 4, 5)
    out = normalize_row_values({"id": uid, "created_at": now})
    assert out["id"] == str(uid)
    assert isinstance(out["id"], str)
    assert out["created_at"] is now  # db.py has no datetime -> ISO conversion

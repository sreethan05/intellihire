import asyncio
import os
import re
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import psycopg2
import psycopg2.extras
from psycopg2.pool import SimpleConnectionPool

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL is not set")

pool = SimpleConnectionPool(1, 20, dsn=DATABASE_URL)

EMPTY_UUID = "00000000-0000-0000-0000-000000000000"


@contextmanager
def get_connection():
    conn = pool.getconn()
    try:
        yield conn
    finally:
        pool.putconn(conn)


class QueryError(Exception):
    def __init__(self, message: str, code: Optional[str] = None):
        self.message = message
        self.code = code
        super().__init__(message)

    def get(self, key: str, default: Any = None) -> Any:
        return getattr(self, key, default)


class QueryResponse:
    def __init__(self, data: Any = None, error: Optional[QueryError] = None, count: Optional[int] = None):
        self.data = data
        self.error = error
        self.count = count

    def __iter__(self):
        yield self.data
        yield self.error


@dataclass
class Relation:
    column: str
    target_table: str
    target_column: str = "id"


@dataclass
class SelectEmbed:
    alias: str
    target_table: str
    fk_column: str
    columns: str


@dataclass
class ParsedSelect:
    include_all: bool
    columns: List[str]
    embeds: List[SelectEmbed]


RELATIONS: Dict[str, List[Relation]] = {
    "users": [Relation("created_by", "users"), Relation("college_id", "colleges")],
    "candidate_profiles": [Relation("user_id", "users"), Relation("college_id", "colleges")],
    "exams": [Relation("created_by", "users")],
    "jobs": [Relation("college_id", "colleges"), Relation("exam_id", "exams"), Relation("created_by", "users")],
    "candidate_status": [Relation("job_id", "jobs"), Relation("candidate_id", "users")],
    "candidate_pipeline": [Relation("candidate_id", "users"), Relation("job_id", "jobs"), Relation("updated_by", "users")],
    "questions": [Relation("created_by", "users")],
    "exam_questions": [Relation("exam_id", "exams"), Relation("question_id", "questions")],
    "coding_questions": [Relation("created_by", "users")],
    "exam_coding_questions": [Relation("exam_id", "exams"), Relation("coding_question_id", "coding_questions")],
    "exam_assignments": [
        Relation("exam_id", "exams"),
        Relation("candidate_id", "users"),
        Relation("assigned_by", "users"),
        Relation("job_id", "jobs"),
    ],
    "attempts": [Relation("exam_id", "exams"), Relation("candidate_id", "users"), Relation("recruiter_id", "users")],
    "answers": [Relation("attempt_id", "attempts"), Relation("question_id", "questions")],
    "coding_submissions": [Relation("attempt_id", "attempts"), Relation("coding_question_id", "coding_questions")],
    "proctoring_snapshots": [Relation("attempt_id", "attempts"), Relation("exam_id", "exams"), Relation("candidate_id", "users")],
    "plagiarism_flags": [
        Relation("attempt_id", "attempts"),
        Relation("coding_submission_id", "coding_submissions"),
        Relation("matched_with_attempt_id", "attempts"),
    ],
    "certificates": [Relation("candidate_id", "users"), Relation("exam_id", "exams")],
    "badges": [Relation("candidate_id", "users")],
    "notifications": [Relation("user_id", "users")],
    "tpo_uploads": [Relation("tpo_id", "users"), Relation("college_id", "colleges")],
    "action_items": [Relation("user_id", "users")],
    "activity_feed": [Relation("actor_id", "users"), Relation("target_user_id", "users")],
    "ai_interviews": [
        Relation("candidate_id", "users"),
        Relation("job_id", "jobs"),
        Relation("exam_id", "exams"),
        Relation("scheduled_by", "users"),
    ],
    "ai_interview_answers": [Relation("interview_id", "ai_interviews")],
    "ai_feedback_reports": [Relation("candidate_id", "users"), Relation("attempt_id", "attempts")],
    "recruiter_voice_interviews": [Relation("recruiter_id", "users")],
    "recruiter_voice_feedback": [
        Relation("voice_interview_id", "recruiter_voice_interviews"),
        Relation("public_id", "recruiter_voice_interviews", "public_id"),
    ],
}

TABLE_ALIASES = {
    "user": "users",
    "users": "users",
    "candidate": "users",
    "recruiter": "users",
    "tpo": "users",
    "actor": "users",
    "college": "colleges",
    "colleges": "colleges",
    "exam": "exams",
    "exams": "exams",
    "job": "jobs",
    "jobs": "jobs",
    "attempt": "attempts",
    "attempts": "attempts",
    "matched_attempt": "attempts",
    "question": "questions",
    "questions": "questions",
    "coding_question": "coding_questions",
    "coding_questions": "coding_questions",
    "coding_submission": "coding_submissions",
    "coding_submissions": "coding_submissions",
}

SOFT_DELETE_TABLES = {"users", "exams", "questions"}


def assert_identifier(identifier: str) -> None:
    if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", identifier):
        raise ValueError(f"Invalid SQL identifier: {identifier}")


def normalize_identifier(identifier: str) -> str:
    trimmed = identifier.strip()
    assert_identifier(trimmed)
    return trimmed


def quote_identifier(identifier: str) -> str:
    return f'"{normalize_identifier(identifier)}"'


def split_top_level(source: str) -> List[str]:
    parts: List[str] = []
    depth = 0
    current: List[str] = []
    for char in source:
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
        if char == "," and depth == 0:
            part = "".join(current).strip()
            if part:
                parts.append(part)
            current = []
            continue
        current.append(char)
    tail = "".join(current).strip()
    if tail:
        parts.append(tail)
    return parts


def find_matching_paren(source: str, open_index: int) -> int:
    depth = 0
    for index in range(open_index, len(source)):
        char = source[index]
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth == 0:
                return index
    return -1


def relation_for_column(base_table: str, column: str) -> Optional[Relation]:
    return next((rel for rel in RELATIONS.get(base_table, []) if rel.column == column), None)


def relation_for_target(base_table: str, target_table: str) -> Optional[Relation]:
    return next((rel for rel in RELATIONS.get(base_table, []) if rel.target_table == target_table), None)


def relation_for_alias(base_table: str, alias: str) -> Optional[Relation]:
    target_table = TABLE_ALIASES.get(alias, alias)
    return relation_for_target(base_table, target_table)


def parse_select(select_clause: str, base_table: str) -> ParsedSelect:
    source = re.sub(r"\s+", " ", (select_clause or "*")).strip() or "*"
    columns: List[str] = []
    embeds: List[SelectEmbed] = []

    for item in split_top_level(source):
        open_index = item.find("(")
        if open_index == -1:
            columns.append(item.strip())
            continue

        close_index = find_matching_paren(item, open_index)
        if close_index == -1:
            raise ValueError(f"Invalid select clause: {item}")

        relation_spec = re.sub(r"![a-z_]+$", "", item[:open_index].strip(), flags=re.IGNORECASE)
        nested_columns = item[open_index + 1:close_index].strip() or "*"

        if ":" in relation_spec:
            raw_alias, raw_column = relation_spec.split(":", 1)
            alias = normalize_identifier(raw_alias)
            fk_column = normalize_identifier(raw_column)
            relation = relation_for_column(base_table, fk_column)
            target_table = relation.target_table if relation else TABLE_ALIASES.get(alias, alias)
        else:
            alias = normalize_identifier(relation_spec)
            target_table = TABLE_ALIASES.get(alias, alias)
            relation = relation_for_target(base_table, target_table)
            if not relation:
                raise ValueError(f"No relation mapping from {base_table} for {relation_spec}")
            fk_column = relation.column

        assert_identifier(target_table)
        embeds.append(SelectEmbed(alias=alias, target_table=target_table, fk_column=fk_column, columns=nested_columns))

    include_all = "*" in columns
    normalized_columns = [normalize_identifier(col) for col in columns if col != "*"]
    return ParsedSelect(include_all=include_all, columns=normalized_columns, embeds=embeds)


class DBBuilder:
    def __init__(self, table: str):
        self.table = normalize_identifier(table)
        self.select_clause = "*"
        self.filters: List[Tuple[str, str, Any]] = []
        self.order_specs: List[Tuple[str, bool]] = []
        self.limit_val: Optional[int] = None
        self.offset_val: Optional[int] = None
        self.is_single = False
        self.is_maybe_single = False
        self.count_mode: Optional[str] = None
        self.head = False
        self.operation = "select"
        self.insert_data: Any = None
        self.update_data: Optional[Dict[str, Any]] = None
        self.on_conflict: Optional[str] = None
        self.ignore_duplicates = False
        self.or_filters: List[str] = []
        self.has_returning = False
        if self.table in SOFT_DELETE_TABLES:
            self.filters.append(("deleted_at", "is", None))

    def select(self, cols: str = "*", count: Optional[str] = None, head: bool = False):
        self.select_clause = cols or "*"
        self.count_mode = count
        self.head = head
        if self.operation != "select":
            self.has_returning = True
        if head:
            self.limit_val = 0
        return self

    def eq(self, col: str, val: Any):
        return self._add_filter(col, "eq", val)

    def neq(self, col: str, val: Any):
        return self._add_filter(col, "neq", val)

    def gt(self, col: str, val: Any):
        return self._add_filter(col, "gt", val)

    def gte(self, col: str, val: Any):
        return self._add_filter(col, "gte", val)

    def lt(self, col: str, val: Any):
        return self._add_filter(col, "lt", val)

    def lte(self, col: str, val: Any):
        return self._add_filter(col, "lte", val)

    def like(self, col: str, val: Any):
        return self._add_filter(col, "like", val)

    def ilike(self, col: str, val: Any):
        return self._add_filter(col, "ilike", val)

    def is_(self, col: str, val: Any):
        return self._add_filter(col, "is", val)

    def is_not(self, col: str, val: Any):
        return self._add_filter(col, "is_not", val)

    def in_(self, col: str, vals: List[Any]):
        return self._add_filter(col, "in", vals)

    def or_(self, val: str):
        self.or_filters.append(val)
        return self

    def order(self, col: str, ascending: bool = True):
        self.order_specs.append((normalize_identifier(col), ascending))
        return self

    def range(self, start: int, end: int):
        self.offset_val = start
        self.limit_val = max(0, end - start + 1)
        return self

    def limit(self, val: int):
        self.limit_val = val
        return self

    def single(self):
        self.is_single = True
        self.limit_val = self.limit_val or 1
        return self

    def maybeSingle(self):
        self.is_maybe_single = True
        self.limit_val = self.limit_val or 1
        return self

    def insert(self, data: Any):
        self.operation = "insert"
        self.insert_data = data
        return self

    def update(self, data: Dict[str, Any]):
        self.operation = "update"
        self.update_data = data
        return self

    def upsert(self, data: Any, on_conflict: Optional[str] = None, ignore_duplicates: bool = False, **kwargs):
        self.operation = "upsert"
        self.insert_data = data
        self.on_conflict = on_conflict or kwargs.get("onConflict") or kwargs.get("on_conflict") or "id"
        self.ignore_duplicates = ignore_duplicates or bool(kwargs.get("ignoreDuplicates"))
        return self

    def delete(self):
        self.operation = "delete"
        return self

    def onConflict(self, col: str):
        self.on_conflict = col
        return self

    def __await__(self):
        return self.execute().__await__()

    def _add_filter(self, col: str, op: str, val: Any):
        self.filters.append((col.strip(), op, val))
        return self

    async def execute(self) -> QueryResponse:
        return await asyncio.to_thread(self._sync_execute)

    def _sync_execute(self) -> QueryResponse:
        with get_connection() as conn:
            try:
                if self.operation == "select":
                    rows, _, count = self._run_select(conn)
                    return QueryResponse(data=self._apply_single(rows), count=count)
                if self.operation == "insert":
                    rows = self._execute_insert(conn, upsert=bool(self.on_conflict))
                    return QueryResponse(data=self._apply_single(rows) if (self.is_single or self.is_maybe_single) else rows)
                if self.operation == "upsert":
                    rows = self._execute_insert(conn, upsert=True)
                    return QueryResponse(data=self._apply_single(rows) if (self.is_single or self.is_maybe_single) else rows)
                if self.operation == "update":
                    rows = self._execute_update(conn)
                    return QueryResponse(data=self._apply_single(rows) if (self.is_single or self.is_maybe_single) else rows)
                if self.operation == "delete":
                    rows = self._execute_delete(conn)
                    return QueryResponse(data=rows)
                raise ValueError(f"Unsupported operation: {self.operation}")
            except Exception as exc:
                conn.rollback()
                return QueryResponse(error=QueryError(str(exc), getattr(exc, "pgcode", None)))

    def _run_select(self, conn, extra_columns: Optional[List[str]] = None):
        parsed = parse_select(self.select_clause, self.table)
        extra_columns = extra_columns or []
        count = self._run_count(conn) if self.count_mode == "exact" else None
        if self.head:
            return [], [], count

        columns_to_fetch = set()
        if not parsed.include_all:
            columns_to_fetch.update(parsed.columns)
            columns_to_fetch.update(embed.fk_column for embed in parsed.embeds)
            columns_to_fetch.update(normalize_identifier(col) for col in extra_columns)
            if not columns_to_fetch:
                columns_to_fetch.add("id")

        select_sql = "*" if parsed.include_all else ", ".join(quote_identifier(col) for col in sorted(columns_to_fetch))
        params: List[Any] = []
        where_sql, where_params = self._build_where()
        params.extend(where_params)
        order_sql = self._build_order()

        limit_sql = ""
        if self.limit_val is not None:
            limit_sql = " LIMIT %s"
            params.append(self.limit_val)

        offset_sql = ""
        if self.offset_val is not None:
            offset_sql = " OFFSET %s"
            params.append(self.offset_val)

        sql = f"SELECT {select_sql} FROM {quote_identifier(self.table)}"
        if where_sql:
            sql += f" WHERE {where_sql}"
        sql += order_sql + limit_sql + offset_sql

        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            raw_rows = [dict(row) for row in cur.fetchall()]

        rows = [self._project_row(row, parsed) for row in raw_rows]
        self._hydrate_embeds(conn, raw_rows, rows, parsed.embeds)
        return rows, raw_rows, count

    def _run_count(self, conn) -> int:
        where_sql, where_params = self._build_where()
        sql = f"SELECT COUNT(*) AS count FROM {quote_identifier(self.table)}"
        if where_sql:
            sql += f" WHERE {where_sql}"
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, where_params)
            row = cur.fetchone()
            return int(row["count"] if row else 0)

    def _execute_insert(self, conn, upsert: bool = False) -> List[Dict[str, Any]]:
        rows = self.insert_data if isinstance(self.insert_data, list) else [self.insert_data]
        rows = [row for row in rows if row]
        if not rows:
            return []

        columns = sorted({normalize_identifier(col) for row in rows for col in row.keys()})
        params: List[Any] = []
        row_placeholders = []
        for row in rows:
            placeholders = []
            for col in columns:
                params.append(row.get(col))
                placeholders.append("%s")
            row_placeholders.append("(" + ", ".join(placeholders) + ")")

        sql = (
            f"INSERT INTO {quote_identifier(self.table)} "
            f"({', '.join(quote_identifier(col) for col in columns)}) "
            f"VALUES {', '.join(row_placeholders)}"
        )

        if upsert:
            conflict_columns = [normalize_identifier(col.strip()) for col in (self.on_conflict or "id").split(",") if col.strip()]
            update_columns = [col for col in columns if col not in conflict_columns]
            conflict_sql = ", ".join(quote_identifier(col) for col in conflict_columns)
            if self.ignore_duplicates or not update_columns:
                sql += f" ON CONFLICT ({conflict_sql}) DO NOTHING"
            else:
                updates = ", ".join(f"{quote_identifier(col)} = EXCLUDED.{quote_identifier(col)}" for col in update_columns)
                sql += f" ON CONFLICT ({conflict_sql}) DO UPDATE SET {updates}"

        sql += " RETURNING *"
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            conn.commit()
            raw_rows = [dict(row) for row in cur.fetchall()]
        return self._mutation_rows(conn, raw_rows)

    def _execute_update(self, conn) -> List[Dict[str, Any]]:
        patch = self.update_data or {}
        if not patch:
            return []

        params: List[Any] = []
        set_sql = []
        for col, value in patch.items():
            set_sql.append(f"{quote_identifier(col)} = %s")
            params.append(value)

        where_sql, where_params = self._build_where()
        params.extend(where_params)

        sql = f"UPDATE {quote_identifier(self.table)} SET {', '.join(set_sql)}"
        if where_sql:
            sql += f" WHERE {where_sql}"
        sql += " RETURNING *"
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            conn.commit()
            raw_rows = [dict(row) for row in cur.fetchall()]
        return self._mutation_rows(conn, raw_rows)

    def _execute_delete(self, conn) -> List[Dict[str, Any]]:
        where_sql, where_params = self._build_where()
        if self.table in SOFT_DELETE_TABLES:
            sql = f"UPDATE {quote_identifier(self.table)} SET deleted_at = NOW()"
        else:
            sql = f"DELETE FROM {quote_identifier(self.table)}"
        if where_sql:
            sql += f" WHERE {where_sql}"
        sql += " RETURNING *"
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, where_params)
            conn.commit()
            raw_rows = [dict(row) for row in cur.fetchall()]
        return self._mutation_rows(conn, raw_rows)

    def _mutation_rows(self, conn, raw_rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        parsed = parse_select(self.select_clause, self.table)
        rows = [self._project_row(row, parsed) for row in raw_rows]
        self._hydrate_embeds(conn, raw_rows, rows, parsed.embeds)
        return rows

    def _project_row(self, row: Dict[str, Any], parsed: ParsedSelect) -> Dict[str, Any]:
        if parsed.include_all:
            return dict(row)
        return {column: row.get(column) for column in parsed.columns}

    def _hydrate_embeds(self, conn, raw_rows: List[Dict[str, Any]], rows: List[Dict[str, Any]], embeds: List[SelectEmbed]) -> None:
        for embed in embeds:
            relation = relation_for_column(self.table, embed.fk_column)
            target_column = relation.target_column if relation else "id"
            fk_values: List[Any] = []
            for raw in raw_rows:
                value = raw.get(embed.fk_column)
                if value is not None and value not in fk_values:
                    fk_values.append(value)

            if not fk_values:
                for row in rows:
                    row[embed.alias] = None
                continue

            child_builder = DBBuilder(embed.target_table).select(embed.columns).in_(target_column, fk_values)
            child_rows, child_raw_rows, _ = child_builder._run_select(conn, extra_columns=[target_column])
            child_by_id = {raw.get(target_column): child_rows[index] for index, raw in enumerate(child_raw_rows)}

            for index, row in enumerate(rows):
                fk_value = raw_rows[index].get(embed.fk_column)
                row[embed.alias] = child_by_id.get(fk_value) if fk_value is not None else None

    def _apply_single(self, rows: List[Dict[str, Any]]):
        if self.is_maybe_single:
            return rows[0] if rows else None
        if self.is_single:
            if len(rows) != 1:
                raise ValueError("The result contains 0 rows" if not rows else "The result contains multiple rows")
            return rows[0]
        return rows

    def _build_order(self) -> str:
        if not self.order_specs:
            return ""
        parts = [f"{quote_identifier(col)} {'ASC' if ascending else 'DESC'}" for col, ascending in self.order_specs]
        return " ORDER BY " + ", ".join(parts)

    def _build_where(self) -> Tuple[str, List[Any]]:
        clauses = []
        params: List[Any] = []
        for col, op, val in self.filters:
            clause, clause_params = self._filter_to_sql(col, op, val)
            clauses.append(clause)
            params.extend(clause_params)
        for or_filter in self.or_filters:
            or_clause, or_params = self._parse_or_filter(or_filter)
            if or_clause:
                clauses.append(or_clause)
                params.extend(or_params)
        return " AND ".join(clauses), params

    def _filter_to_sql(self, col: str, op: str, val: Any) -> Tuple[str, List[Any]]:
        if "." in col:
            alias, child_column = col.split(".", 1)
            relation = relation_for_alias(self.table, alias)
            if not relation:
                raise ValueError(f"No relation mapping from {self.table} for filter {col}")
            child_clause, child_params = self._simple_filter_to_sql(child_column, op, val)
            return (
                f"{quote_identifier(relation.column)} IN "
                f"(SELECT {quote_identifier(relation.target_column)} FROM {quote_identifier(relation.target_table)} WHERE {child_clause})",
                child_params,
            )
        return self._simple_filter_to_sql(col, op, val)

    def _simple_filter_to_sql(self, col: str, op: str, val: Any) -> Tuple[str, List[Any]]:
        column_sql = quote_identifier(col)
        if op == "eq":
            return (f"{column_sql} IS NULL", []) if val is None else (f"{column_sql} = %s", [val])
        if op == "neq":
            return (f"{column_sql} IS NOT NULL", []) if val is None else (f"{column_sql} <> %s", [val])
        if op == "is":
            return (f"{column_sql} IS NULL", []) if val is None else (f"{column_sql} IS %s", [val])
        if op == "is_not":
            return (f"{column_sql} IS NOT NULL", []) if val is None else (f"{column_sql} IS NOT %s", [val])
        if op == "in":
            vals = list(val or [])
            if not vals:
                return "FALSE", []
            return f"{column_sql} IN ({', '.join(['%s'] * len(vals))})", vals
        if op == "gt":
            return f"{column_sql} > %s", [val]
        if op == "gte":
            return f"{column_sql} >= %s", [val]
        if op == "lt":
            return f"{column_sql} < %s", [val]
        if op == "lte":
            return f"{column_sql} <= %s", [val]
        if op == "like":
            return f"{column_sql} LIKE %s", [val]
        if op == "ilike":
            return f"{column_sql} ILIKE %s", [val]
        raise ValueError(f"Unsupported filter operator: {op}")

    def _parse_or_filter(self, filter_str: str) -> Tuple[str, List[Any]]:
        sub_clauses = []
        params: List[Any] = []
        for part in split_top_level(filter_str):
            pieces = part.strip().split(".", 2)
            if len(pieces) < 2:
                continue
            col = pieces[0]
            op = pieces[1]
            raw_val = pieces[2] if len(pieces) > 2 else ""
            val: Any = raw_val
            if raw_val.lower() == "null":
                val = None
            elif raw_val.lower() == "true":
                val = True
            elif raw_val.lower() == "false":
                val = False
            elif op == "in":
                val = [item.strip() for item in raw_val.strip("()").split(",") if item.strip()]
            clause, clause_params = self._filter_to_sql(col, op, val)
            sub_clauses.append(clause)
            params.extend(clause_params)
        if not sub_clauses:
            return "", []
        return "(" + " OR ".join(sub_clauses) + ")", params


class db:
    @staticmethod
    def from_(table: str) -> DBBuilder:
        return DBBuilder(table)


async def transaction(func):
    with get_connection() as conn:
        try:
            res = await func(conn)
            conn.commit()
            return res
        except Exception as exc:
            conn.rollback()
            raise exc

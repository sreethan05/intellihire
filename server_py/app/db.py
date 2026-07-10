import os
import psycopg2
import psycopg2.extras
from psycopg2.pool import SimpleConnectionPool
from contextlib import contextmanager
import asyncio
from typing import Any, List, Dict, Optional, Tuple

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL is not set")

# Create connection pool
pool = SimpleConnectionPool(1, 20, dsn=DATABASE_URL)

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

class QueryResponse:
    def __init__(self, data: Any = None, error: Optional[QueryError] = None, count: Optional[int] = None):
        self.data = data
        self.error = error
        self.count = count

    # Allow unpacking: data, error = await query
    def __iter__(self):
        yield self.data
        yield self.error

class DBBuilder:
    def __init__(self, table: str):
        self.table = table
        self.select_clause = "*"
        self.filters = []
        self.order_by = None
        self.limit_val = None
        self.offset_val = None
        self.is_single = False
        self.is_maybe_single = False
        self.count_mode = None
        self.values = []
        self.operation = "select"
        self.insert_data = None
        self.update_data = None
        self.on_conflict = None
        self.or_filters = []

    def or_(self, val: str):
        self.or_filters.append(val)
        return self

    def _parse_or_filter(self, filter_str: str) -> Tuple[str, List[Any]]:
        parts = []
        current = []
        paren_depth = 0
        for char in filter_str:
            if char == '(':
                paren_depth += 1
                current.append(char)
            elif char == ')':
                paren_depth -= 1
                current.append(char)
            elif char == ',' and paren_depth == 0:
                parts.append("".join(current))
                current = []
            else:
                current.append(char)
        if current:
            parts.append("".join(current))

        sub_clauses = []
        params = []
        for part in parts:
            part = part.strip()
            if not part:
                continue
            sub_parts = part.split(".", 2)
            if len(sub_parts) < 2:
                continue
            col = sub_parts[0]
            op = sub_parts[1]
            val_str = sub_parts[2] if len(sub_parts) > 2 else ""

            if op == "eq":
                if val_str.lower() == "null":
                    sub_clauses.append(f'"{col}" IS NULL')
                else:
                    sub_clauses.append(f'"{col}" = %s')
                    params.append(val_str)
            elif op == "is" and val_str.lower() == "null":
                sub_clauses.append(f'"{col}" IS NULL')
            elif op == "isnot" and val_str.lower() == "null":
                sub_clauses.append(f'"{col}" IS NOT NULL')
            elif op == "in":
                val_clean = val_str.strip("()")
                vals = [v.strip() for v in val_clean.split(",") if v.strip()]
                if vals:
                    placeholders = ", ".join(["%s"] * len(vals))
                    sub_clauses.append(f'"{col}" IN ({placeholders})')
                    params.extend(vals)
                else:
                    sub_clauses.append("FALSE")
            elif op == "neq":
                sub_clauses.append(f'"{col}" <> %s')
                params.append(val_str)
            elif op == "gt":
                sub_clauses.append(f'"{col}" > %s')
                params.append(val_str)
            elif op == "gte":
                sub_clauses.append(f'"{col}" >= %s')
                params.append(val_str)
            elif op == "lt":
                sub_clauses.append(f'"{col}" < %s')
                params.append(val_str)
            elif op == "lte":
                sub_clauses.append(f'"{col}" <= %s')
                params.append(val_str)

        if sub_clauses:
            return "(" + " OR ".join(sub_clauses) + ")", params
        return "", []

    def select(self, cols: str = "*", count: Optional[str] = None, head: bool = False):
        self.select_clause = cols
        self.count_mode = count
        if head:
            self.limit_val = 0
        return self

    def eq(self, col: str, val: Any):
        if val is None:
            self.filters.append((col, "is_null", None))
        else:
            self.filters.append((col, "=", val))
        return self

    def neq(self, col: str, val: Any):
        if val is None:
            self.filters.append((col, "is_not_null", None))
        else:
            self.filters.append((col, "<>", val))
        return self

    def gt(self, col: str, val: Any):
        self.filters.append((col, ">", val))
        return self

    def gte(self, col: str, val: Any):
        self.filters.append((col, ">=", val))
        return self

    def lt(self, col: str, val: Any):
        self.filters.append((col, "<", val))
        return self

    def lte(self, col: str, val: Any):
        self.filters.append((col, "<=", val))
        return self

    def in_(self, col: str, vals: List[Any]):
        self.filters.append((col, "in", vals))
        return self

    def order(self, col: str, ascending: bool = True):
        self.order_by = f'"{col}" {"ASC" if ascending else "DESC"}'
        return self

    def range(self, start: int, end: int):
        self.offset_val = start
        self.limit_val = end - start + 1
        return self

    def limit(self, val: int):
        self.limit_val = val
        return self

    def single(self):
        self.is_single = True
        return self

    def maybeSingle(self):
        self.is_maybe_single = True
        return self

    def insert(self, data: Any):
        self.operation = "insert"
        self.insert_data = data
        return self

    def update(self, data: Any):
        self.operation = "update"
        self.update_data = data
        return self

    def delete(self):
        self.operation = "delete"
        return self

    def onConflict(self, col: str):
        self.on_conflict = col
        return self

    def __await__(self):
        return self.execute().__await__()

    async def execute(self) -> QueryResponse:
        return await asyncio.to_thread(self._sync_execute)

    def _sync_execute(self) -> QueryResponse:
        sql = ""
        params = []
        
        with get_connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                try:
                    if self.operation == "select":
                        # Support exact count if requested
                        total_count = None
                        if self.count_mode == "exact":
                            count_sql, count_params = self._build_select_count()
                            cur.execute(count_sql, count_params)
                            total_count = cur.fetchone()["count"]

                        sql, params = self._build_select()
                        cur.execute(sql, params)
                        
                        if self.limit_val == 0:
                            data = []
                        else:
                            data = cur.fetchall()
                            # Convert RealDictRow to standard dict
                            data = [dict(row) for row in data]
                        
                        if self.is_single:
                            if not data:
                                raise QueryError("No rows returned for single query")
                            return QueryResponse(data=data[0], count=total_count)
                        elif self.is_maybe_single:
                            return QueryResponse(data=data[0] if data else None, count=total_count)
                        else:
                            return QueryResponse(data=data, count=total_count)

                    elif self.operation == "insert":
                        sql, params = self._build_insert()
                        cur.execute(sql, params)
                        conn.commit()
                        
                        data = cur.fetchall()
                        data = [dict(row) for row in data]
                        
                        if self.is_single or self.is_maybe_single:
                            return QueryResponse(data=data[0] if data else None)
                        return QueryResponse(data=data)

                    elif self.operation == "update":
                        sql, params = self._build_update()
                        cur.execute(sql, params)
                        conn.commit()
                        
                        data = cur.fetchall()
                        data = [dict(row) for row in data]
                        
                        if self.is_single or self.is_maybe_single:
                            return QueryResponse(data=data[0] if data else None)
                        return QueryResponse(data=data)

                    elif self.operation == "delete":
                        sql, params = self._build_delete()
                        cur.execute(sql, params)
                        conn.commit()
                        
                        data = cur.fetchall()
                        data = [dict(row) for row in data]
                        return QueryResponse(data=data)

                except Exception as exc:
                    conn.rollback()
                    err_msg = str(exc)
                    code = getattr(exc, "pgcode", None)
                    return QueryResponse(error=QueryError(err_msg, code))

    def _build_select(self) -> Tuple[str, List[Any]]:
        params = []
        sql = f'SELECT {self.select_clause} FROM "{self.table}"'
        
        where_sql, where_params = self._build_where()
        if where_sql:
            sql += " WHERE " + where_sql
            params.extend(where_params)
            
        if self.order_by:
            sql += f" ORDER BY {self.order_by}"
            
        if self.limit_val is not None:
            sql += f" LIMIT {self.limit_val}"
            
        if self.offset_val is not None:
            sql += f" OFFSET {self.offset_val}"
            
        return sql, params

    def _build_select_count(self) -> Tuple[str, List[Any]]:
        params = []
        sql = f'SELECT COUNT(*) as count FROM "{self.table}"'
        where_sql, where_params = self._build_where()
        if where_sql:
            sql += " WHERE " + where_sql
            params.extend(where_params)
        return sql, params

    def _build_insert(self) -> Tuple[str, List[Any]]:
        params = []
        if isinstance(self.insert_data, list):
            rows = self.insert_data
        else:
            rows = [self.insert_data]

        columns = list(rows[0].keys())
        col_list = ", ".join([f'"{c}"' for c in columns])
        
        val_placeholders = []
        for row in rows:
            placeholders = []
            for c in columns:
                placeholders.append("%s")
                params.append(row[c])
            val_placeholders.append("(" + ", ".join(placeholders) + ")")
            
        sql = f'INSERT INTO "{self.table}" ({col_list}) VALUES {", ".join(val_placeholders)}'
        
        if self.on_conflict:
            conflict_cols = [f'"{c.strip()}"' for c in self.on_conflict.split(",")]
            conflict_target = ", ".join(conflict_cols)
            conflict_list = [c.strip() for c in self.on_conflict.split(",")]
            
            update_sets = []
            for c in columns:
                if c not in conflict_list:
                    update_sets.append(f'"{c}" = EXCLUDED."{c}"')
            if update_sets:
                sql += f' ON CONFLICT ({conflict_target}) DO UPDATE SET {", ".join(update_sets)}'
            else:
                sql += f' ON CONFLICT ({conflict_target}) DO NOTHING'
                
        sql += " RETURNING *"
        return sql, params

    def _build_update(self) -> Tuple[str, List[Any]]:
        params = []
        sets = []
        for k, v in self.update_data.items():
            sets.append(f'"{k}" = %s')
            params.append(v)
            
        sql = f'UPDATE "{self.table}" SET {", ".join(sets)}'
        
        where_sql, where_params = self._build_where()
        if where_sql:
            sql += " WHERE " + where_sql
            params.extend(where_params)
            
        sql += " RETURNING *"
        return sql, params

    def _build_delete(self) -> Tuple[str, List[Any]]:
        params = []
        sql = f'DELETE FROM "{self.table}"'
        where_sql, where_params = self._build_where()
        if where_sql:
            sql += " WHERE " + where_sql
            params.extend(where_params)
        sql += " RETURNING *"
        return sql, params

    def _build_where(self) -> Tuple[str, List[Any]]:
        clauses = []
        params = []
        for col, op, val in self.filters:
            if op == "is_null":
                clauses.append(f'"{col}" IS NULL')
            elif op == "is_not_null":
                clauses.append(f'"{col}" IS NOT NULL')
            elif op == "in":
                placeholders = ", ".join(["%s"] * len(val))
                clauses.append(f'"{col}" IN ({placeholders})')
                params.extend(val)
            else:
                clauses.append(f'"{col}" {op} %s')
                params.append(val)
                
        if hasattr(self, "or_filters") and self.or_filters:
            for or_filter in self.or_filters:
                clause, or_params = self._parse_or_filter(or_filter)
                if clause:
                    clauses.append(clause)
                    params.extend(or_params)
                    
        if not clauses:
            return "", []
        return " AND ".join(clauses), params

class db:
    @staticmethod
    def from_(table: str) -> DBBuilder:
        return DBBuilder(table)

async def transaction(func):
    """Simple wrapper to run a database transaction"""
    # Execute python function inside connection transaction context
    with get_connection() as conn:
        try:
            res = await func(conn)
            conn.commit()
            return res
        except Exception as exc:
            conn.rollback()
            raise exc

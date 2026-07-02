import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

type QueryError = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};

// Existing routes expect Supabase-style flexible row typing from `data`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryResponse<T = any> = {
  data: T | null;
  error: QueryError | null;
  count: number | null;
  status: number;
  statusText: string;
};

type SelectOptions = {
  count?: "exact";
  head?: boolean;
};

type SortSpec = {
  column: string;
  ascending: boolean;
};

type FilterOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "ilike" | "like" | "overlaps";

type SimpleFilter = {
  kind: "simple";
  column: string;
  operator: FilterOperator;
  value: unknown;
};

type OrFilter = {
  kind: "or";
  filters: SimpleFilter[];
};

type Filter = SimpleFilter | OrFilter;

type Operation = "select" | "insert" | "update" | "upsert" | "delete";

type UpsertOptions = {
  onConflict?: string;
  ignoreDuplicates?: boolean;
};

type SelectColumn = {
  type: "column";
  name: string;
};

type SelectEmbed = {
  type: "embed";
  alias: string;
  targetTable: string;
  fkColumn: string;
  columns: string;
};

type SelectItem = SelectColumn | SelectEmbed;

type ParsedSelect = {
  includeAll: boolean;
  columns: string[];
  embeds: SelectEmbed[];
};

type Relation = {
  column: string;
  targetTable: string;
  targetColumn?: string;
};

const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";

const RELATIONS: Record<string, Relation[]> = {
  users: [
    { column: "created_by", targetTable: "users" },
    { column: "college_id", targetTable: "colleges" },
  ],
  candidate_profiles: [
    { column: "user_id", targetTable: "users" },
    { column: "college_id", targetTable: "colleges" },
  ],
  exams: [{ column: "created_by", targetTable: "users" }],
  jobs: [
    { column: "college_id", targetTable: "colleges" },
    { column: "exam_id", targetTable: "exams" },
    { column: "created_by", targetTable: "users" },
  ],
  candidate_status: [
    { column: "job_id", targetTable: "jobs" },
    { column: "candidate_id", targetTable: "users" },
  ],
  questions: [{ column: "created_by", targetTable: "users" }],
  exam_questions: [
    { column: "exam_id", targetTable: "exams" },
    { column: "question_id", targetTable: "questions" },
  ],
  coding_questions: [{ column: "created_by", targetTable: "users" }],
  exam_coding_questions: [
    { column: "exam_id", targetTable: "exams" },
    { column: "coding_question_id", targetTable: "coding_questions" },
  ],
  exam_assignments: [
    { column: "exam_id", targetTable: "exams" },
    { column: "candidate_id", targetTable: "users" },
    { column: "assigned_by", targetTable: "users" },
    { column: "job_id", targetTable: "jobs" },
  ],
  attempts: [
    { column: "exam_id", targetTable: "exams" },
    { column: "candidate_id", targetTable: "users" },
    { column: "recruiter_id", targetTable: "users" },
  ],
  answers: [
    { column: "attempt_id", targetTable: "attempts" },
    { column: "question_id", targetTable: "questions" },
  ],
  coding_submissions: [
    { column: "attempt_id", targetTable: "attempts" },
    { column: "coding_question_id", targetTable: "coding_questions" },
  ],
  proctoring_snapshots: [
    { column: "attempt_id", targetTable: "attempts" },
    { column: "exam_id", targetTable: "exams" },
    { column: "candidate_id", targetTable: "users" },
  ],
  plagiarism_flags: [
    { column: "attempt_id", targetTable: "attempts" },
    { column: "coding_submission_id", targetTable: "coding_submissions" },
    { column: "matched_with_attempt_id", targetTable: "attempts" },
  ],
  certificates: [
    { column: "candidate_id", targetTable: "users" },
    { column: "exam_id", targetTable: "exams" },
  ],
  badges: [{ column: "candidate_id", targetTable: "users" }],
  notifications: [{ column: "user_id", targetTable: "users" }],
  tpo_uploads: [
    { column: "tpo_id", targetTable: "users" },
    { column: "college_id", targetTable: "colleges" },
  ],
  ai_interviews: [
    { column: "candidate_id", targetTable: "users" },
    { column: "job_id", targetTable: "jobs" },
    { column: "exam_id", targetTable: "exams" },
    { column: "scheduled_by", targetTable: "users" },
  ],
  ai_interview_answers: [{ column: "interview_id", targetTable: "ai_interviews" }],
  ai_feedback_reports: [
    { column: "candidate_id", targetTable: "users" },
    { column: "attempt_id", targetTable: "attempts" },
  ],
  recruiter_voice_interviews: [{ column: "recruiter_id", targetTable: "users" }],
  recruiter_voice_feedback: [
    { column: "voice_interview_id", targetTable: "recruiter_voice_interviews" },
    { column: "public_id", targetTable: "recruiter_voice_interviews", targetColumn: "public_id" },
  ],
};

const TABLE_ALIASES: Record<string, string> = {
  user: "users",
  users: "users",
  candidate: "users",
  recruiter: "users",
  tpo: "users",
  college: "colleges",
  colleges: "colleges",
  exam: "exams",
  exams: "exams",
  job: "jobs",
  jobs: "jobs",
  attempt: "attempts",
  attempts: "attempts",
  matched_attempt: "attempts",
  question: "questions",
  questions: "questions",
  coding_question: "coding_questions",
  coding_questions: "coding_questions",
  coding_submission: "coding_submissions",
  coding_submissions: "coding_submissions",
};

function databaseUrl() {
  return config.DATABASE_URL || process.env.POSTGRES_URL;
}

export const isPostgresConfigured = () =>
  Boolean(databaseUrl() || (process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE));

export const pool = new Pool(
  databaseUrl()
    ? {
        connectionString: databaseUrl(),
        ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
      }
    : {
        host: process.env.PGHOST,
        port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
        database: process.env.PGDATABASE,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
      }
);

function toQueryError(error: unknown): QueryError {
  if (error instanceof Error) {
    const maybePg = error as Error & { code?: string; detail?: string; hint?: string };
    return {
      message: error.message,
      code: maybePg.code,
      details: maybePg.detail,
      hint: maybePg.hint,
    };
  }
  return { message: String(error) };
}

function assertIdentifier(identifier: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  }
}

function quoteIdentifier(identifier: string) {
  assertIdentifier(identifier);
  return `"${identifier}"`;
}

function normalizeColumn(column: string) {
  const trimmed = column.trim();
  assertIdentifier(trimmed);
  return trimmed;
}

function splitTopLevel(input: string) {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of input) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;

    if (char === "," && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function findMatchingParen(input: string, openIndex: number) {
  let depth = 0;
  for (let index = openIndex; index < input.length; index += 1) {
    const char = input[index];
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function relationForColumn(baseTable: string, column: string) {
  return RELATIONS[baseTable]?.find((relation) => relation.column === column);
}

function relationForTarget(baseTable: string, targetTable: string) {
  return RELATIONS[baseTable]?.find((relation) => relation.targetTable === targetTable);
}

function parseSelect(selectClause: string | undefined, baseTable: string): ParsedSelect {
  const source = (selectClause || "*").replace(/\s+/g, " ").trim() || "*";
  const items: SelectItem[] = splitTopLevel(source).map((item): SelectItem => {
    const openIndex = item.indexOf("(");
    if (openIndex === -1) {
      return { type: "column", name: item.trim() };
    }

    const closeIndex = findMatchingParen(item, openIndex);
    if (closeIndex === -1) {
      throw new Error(`Invalid select clause: ${item}`);
    }

    const relationSpec = item.slice(0, openIndex).trim().replace(/![a-z_]+$/i, "");
    const columns = item.slice(openIndex + 1, closeIndex).trim() || "*";
    let alias = relationSpec;
    let fkColumn: string | undefined;
    let targetTable: string | undefined;

    if (relationSpec.includes(":")) {
      const [rawAlias, rawColumn] = relationSpec.split(":");
      alias = rawAlias.trim();
      fkColumn = normalizeColumn(rawColumn.trim());
      targetTable = relationForColumn(baseTable, fkColumn)?.targetTable || TABLE_ALIASES[alias] || alias;
    } else {
      targetTable = TABLE_ALIASES[relationSpec] || relationSpec;
      const relation = relationForTarget(baseTable, targetTable);
      fkColumn = relation?.column;
    }

    if (!targetTable || !fkColumn) {
      throw new Error(`No relation mapping from ${baseTable} for ${relationSpec}`);
    }

    assertIdentifier(alias);
    assertIdentifier(targetTable);

    return {
      type: "embed",
      alias,
      targetTable,
      fkColumn,
      columns,
    };
  });

  const columns = items
    .filter((item): item is SelectColumn => item.type === "column")
    .map((item) => item.name.trim())
    .filter(Boolean);

  const embeds = items.filter((item): item is SelectEmbed => item.type === "embed");

  return {
    includeAll: columns.includes("*"),
    columns: columns.filter((column) => column !== "*").map(normalizeColumn),
    embeds,
  };
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function parameter(values: unknown[], value: unknown) {
  values.push(value);
  return `$${values.length}`;
}

function normalizeValue(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function conditionSql(filter: SimpleFilter, values: unknown[]) {
  const column = quoteIdentifier(filter.column);
  const value = normalizeValue(filter.value);

  if (filter.operator === "eq" && value === null) return `${column} IS NULL`;
  if (filter.operator === "neq" && value === null) return `${column} IS NOT NULL`;

  if (filter.operator === "in") {
    const list = Array.isArray(value) ? value : [];
    if (list.length === 0) return "false";
    return `${column} IN (${list.map((item) => parameter(values, normalizeValue(item))).join(", ")})`;
  }

  if (filter.operator === "overlaps") {
    const list = Array.isArray(value) ? value : [];
    if (list.length === 0) return "false";
    const placeholder = parameter(values, list);
    return `${column} ?| ${placeholder}::text[]`;
  }

  const placeholder = parameter(values, value);
  switch (filter.operator) {
    case "eq":
      return `${column} = ${placeholder}`;
    case "neq":
      return `${column} <> ${placeholder}`;
    case "gt":
      return `${column} > ${placeholder}`;
    case "gte":
      return `${column} >= ${placeholder}`;
    case "lt":
      return `${column} < ${placeholder}`;
    case "lte":
      return `${column} <= ${placeholder}`;
    case "ilike":
      return `${column} ILIKE ${placeholder}`;
    case "like":
      return `${column} LIKE ${placeholder}`;
    default:
      throw new Error(`Unsupported filter operator: ${filter.operator}`);
  }
}

function whereSql(filters: Filter[], values: unknown[]) {
  if (filters.length === 0) return "";

  const clauses = filters.map((filter) => {
    if (filter.kind === "or") {
      if (filter.filters.length === 0) return "false";
      return `(${filter.filters.map((child) => conditionSql(child, values)).join(" OR ")})`;
    }
    return conditionSql(filter, values);
  });

  return ` WHERE ${clauses.join(" AND ")}`;
}

function parseOrFilter(source: string): SimpleFilter[] {
  return splitTopLevel(source).map((part) => {
    const match = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\.(eq|neq|gt|gte|lt|lte|like|ilike|in)\.(.*)$/);
    if (!match) {
      throw new Error(`Unsupported OR filter: ${part}`);
    }

    const [, column, operator, rawValue] = match;
    let value: unknown = rawValue;

    if (operator === "in") {
      const listMatch = rawValue.match(/^\((.*)\)$/);
      value = listMatch?.[1] ? splitTopLevel(listMatch[1]).map((item) => item.trim()) : [];
    }

    return {
      kind: "simple",
      column: normalizeColumn(column),
      operator: operator as FilterOperator,
      value,
    };
  });
}

function projectRow(row: Record<string, unknown>, parsed: ParsedSelect) {
  if (parsed.includeAll) {
    return { ...row };
  }

  const projected: Record<string, unknown> = {};
  for (const column of parsed.columns) {
    projected[column] = row[column];
  }
  return projected;
}

function rowsToResponse<T>(data: T | null, count: number | null = null): QueryResponse<T> {
  return {
    data,
    error: null,
    count,
    status: 200,
    statusText: "OK",
  };
}

class PostgresQueryBuilder implements PromiseLike<QueryResponse> {
  private operation: Operation = "select";
  private selectClause = "*";
  private selectOptions: SelectOptions = {};
  private filters: Filter[] = [];
  private sortSpecs: SortSpec[] = [];
  private limitCount: number | null = null;
  private offsetCount: number | null = null;
  private singleMode: "single" | "maybeSingle" | null = null;
  private mutationValues: Record<string, unknown>[] = [];
  private upsertOptions: UpsertOptions = {};
  private hasReturning = false;

  constructor(private readonly table: string) {
    assertIdentifier(table);
  }

  select(columns = "*", options: SelectOptions = {}) {
    if (this.operation === "select") {
      this.selectClause = columns || "*";
      this.selectOptions = options;
    } else {
      this.hasReturning = true;
      this.selectClause = columns || "*";
      this.selectOptions = options;
    }
    return this;
  }

  insert(values: Record<string, unknown> | Record<string, unknown>[]) {
    this.operation = "insert";
    this.mutationValues = Array.isArray(values) ? values : [values];
    return this;
  }

  update(values: Record<string, unknown>) {
    this.operation = "update";
    this.mutationValues = [values];
    return this;
  }

  upsert(values: Record<string, unknown> | Record<string, unknown>[], options: UpsertOptions = {}) {
    this.operation = "upsert";
    this.mutationValues = Array.isArray(values) ? values : [values];
    this.upsertOptions = options;
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    return this.addFilter(column, "eq", value);
  }

  neq(column: string, value: unknown) {
    return this.addFilter(column, "neq", value);
  }

  gt(column: string, value: unknown) {
    return this.addFilter(column, "gt", value);
  }

  gte(column: string, value: unknown) {
    return this.addFilter(column, "gte", value);
  }

  lt(column: string, value: unknown) {
    return this.addFilter(column, "lt", value);
  }

  lte(column: string, value: unknown) {
    return this.addFilter(column, "lte", value);
  }

  like(column: string, value: unknown) {
    return this.addFilter(column, "like", value);
  }

  ilike(column: string, value: unknown) {
    return this.addFilter(column, "ilike", value);
  }

  in(column: string, values: unknown[]) {
    return this.addFilter(column, "in", values);
  }

  overlaps(column: string, values: unknown[]) {
    return this.addFilter(column, "overlaps", values);
  }

  or(source: string) {
    this.filters.push({ kind: "or", filters: parseOrFilter(source) });
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}) {
    this.sortSpecs.push({
      column: normalizeColumn(column),
      ascending: options.ascending !== false,
    });
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number) {
    this.offsetCount = from;
    this.limitCount = Math.max(0, to - from + 1);
    return this;
  }

  single() {
    this.singleMode = "single";
    this.limitCount ??= 1;
    return this;
  }

  maybeSingle() {
    this.singleMode = "maybeSingle";
    this.limitCount ??= 1;
    return this;
  }

  then<TResult1 = QueryResponse, TResult2 = never>(
    onfulfilled?: ((value: QueryResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private addFilter(column: string, operator: FilterOperator, value: unknown) {
    this.filters.push({
      kind: "simple",
      column: normalizeColumn(column),
      operator,
      value,
    });
    return this;
  }

  private async execute(): Promise<QueryResponse> {
    try {
      if (!isPostgresConfigured()) {
        return {
          data: null,
          error: { message: "PostgreSQL is not configured. Set DATABASE_URL or PGHOST/PGUSER/PGDATABASE." },
          count: null,
          status: 503,
          statusText: "Service Unavailable",
        };
      }

      switch (this.operation) {
        case "select":
          return await this.executeSelect();
        case "insert":
          return await this.executeInsert();
        case "update":
          return await this.executeUpdate();
        case "upsert":
          return await this.executeUpsert();
        case "delete":
          return await this.executeDelete();
        default:
          throw new Error(`Unsupported operation: ${this.operation}`);
      }
    } catch (error) {
      return {
        data: null,
        error: toQueryError(error),
        count: null,
        status: 400,
        statusText: "Bad Request",
      };
    }
  }

  private async executeSelect() {
    const { rows, count } = await this.runSelect();
    return rowsToResponse(this.applySingleMode(rows), count);
  }

  private async runSelect(extraColumns: string[] = []) {
    const parsed = parseSelect(this.selectClause, this.table);
    const values: unknown[] = [];
    const columnsToFetch = new Set<string>();

    if (!parsed.includeAll) {
      for (const column of parsed.columns) columnsToFetch.add(column);
      for (const embed of parsed.embeds) columnsToFetch.add(embed.fkColumn);
      for (const column of extraColumns) columnsToFetch.add(normalizeColumn(column));
      if (columnsToFetch.size === 0) columnsToFetch.add("id");
    }

    const selectSql = parsed.includeAll
      ? "*"
      : Array.from(columnsToFetch).map(quoteIdentifier).join(", ");
    const where = whereSql(this.filters, values);
    const order = this.sortSpecs.length
      ? ` ORDER BY ${this.sortSpecs
          .map((sort) => `${quoteIdentifier(sort.column)} ${sort.ascending ? "ASC" : "DESC"}`)
          .join(", ")}`
      : "";
    const limit = this.limitCount !== null ? ` LIMIT ${parameter(values, this.limitCount)}` : "";
    const offset = this.offsetCount !== null ? ` OFFSET ${parameter(values, this.offsetCount)}` : "";

    const count = this.selectOptions.count === "exact" ? await this.runCount() : null;
    if (this.selectOptions.head) {
      return { rows: [], rawRows: [], count };
    }

    const sql = `SELECT ${selectSql} FROM ${quoteIdentifier(this.table)}${where}${order}${limit}${offset}`;
    const result = await pool.query(sql, values);
    const rawRows = result.rows as Record<string, unknown>[];
    const rows = rawRows.map((row) => projectRow(row, parsed));

    await this.hydrateEmbeds(rawRows, rows, parsed.embeds);
    return { rows, rawRows, count };
  }

  private async runCount() {
    const values: unknown[] = [];
    const where = whereSql(this.filters, values);
    const sql = `SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(this.table)}${where}`;
    const result = await pool.query(sql, values);
    return Number(result.rows[0]?.count || 0);
  }

  private async hydrateEmbeds(rawRows: Record<string, unknown>[], rows: Record<string, unknown>[], embeds: SelectEmbed[]) {
    for (const embed of embeds) {
      const relation = relationForColumn(this.table, embed.fkColumn);
      const targetColumn = relation?.targetColumn || "id";
      const fkValues = unique(rawRows.map((row) => row[embed.fkColumn]).filter((value) => value !== null && value !== undefined));

      if (fkValues.length === 0) {
        rows.forEach((row) => {
          row[embed.alias] = null;
        });
        continue;
      }

      const childBuilder = new PostgresQueryBuilder(embed.targetTable)
        .select(embed.columns)
        .in(targetColumn, fkValues);
      const { rows: childRows, rawRows: childRawRows } = await childBuilder.runSelect([targetColumn]);
      const childById = new Map<unknown, Record<string, unknown>>();
      childRawRows.forEach((childRaw, index) => {
        childById.set(childRaw[targetColumn], childRows[index]);
      });

      rows.forEach((row, index) => {
        const fkValue = rawRows[index][embed.fkColumn];
        row[embed.alias] = fkValue === null || fkValue === undefined ? null : childById.get(fkValue) || null;
      });
    }
  }

  private applySingleMode(rows: Record<string, unknown>[]) {
    if (!this.singleMode) return rows;
    if (rows.length === 0 && this.singleMode === "maybeSingle") return null;
    if (rows.length === 1) return rows[0];
    throw new Error(rows.length === 0 ? "The result contains 0 rows" : "The result contains multiple rows");
  }

  private async executeInsert() {
    if (this.mutationValues.length === 0) return rowsToResponse(this.hasReturning ? [] : null);

    const columns = unique(this.mutationValues.flatMap((row) => Object.keys(row).map(normalizeColumn)));
    const values: unknown[] = [];
    const rowPlaceholders = this.mutationValues.map((row) => {
      const placeholders = columns.map((column) => parameter(values, normalizeValue(row[column])));
      return `(${placeholders.join(", ")})`;
    });
    const returning = this.hasReturning ? ` RETURNING ${this.returningSql()}` : "";
    const sql = `INSERT INTO ${quoteIdentifier(this.table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES ${rowPlaceholders.join(", ")}${returning}`;
    const result = await pool.query(sql, values);
    return this.mutationResponse(result.rows as Record<string, unknown>[]);
  }

  private async executeUpdate() {
    const patch = this.mutationValues[0] || {};
    const columns = Object.keys(patch).map(normalizeColumn);
    if (columns.length === 0) return rowsToResponse(this.hasReturning ? [] : null);

    const values: unknown[] = [];
    const setSql = columns.map((column) => `${quoteIdentifier(column)} = ${parameter(values, normalizeValue(patch[column]))}`).join(", ");
    const where = whereSql(this.filters, values);
    const returning = this.hasReturning ? ` RETURNING ${this.returningSql()}` : "";
    const sql = `UPDATE ${quoteIdentifier(this.table)} SET ${setSql}${where}${returning}`;
    const result = await pool.query(sql, values);
    return this.mutationResponse(result.rows as Record<string, unknown>[]);
  }

  private async executeUpsert() {
    if (this.mutationValues.length === 0) return rowsToResponse(this.hasReturning ? [] : null);

    const columns = unique(this.mutationValues.flatMap((row) => Object.keys(row).map(normalizeColumn)));
    const conflictColumns = (this.upsertOptions.onConflict || "id")
      .split(",")
      .map((column) => normalizeColumn(column.trim()))
      .filter(Boolean);
    const values: unknown[] = [];
    const rowPlaceholders = this.mutationValues.map((row) => {
      const placeholders = columns.map((column) => parameter(values, normalizeValue(row[column])));
      return `(${placeholders.join(", ")})`;
    });
    const updateColumns = columns.filter((column) => !conflictColumns.includes(column));
    const conflictSql = conflictColumns.map(quoteIdentifier).join(", ");
    const action = this.upsertOptions.ignoreDuplicates || updateColumns.length === 0
      ? "DO NOTHING"
      : `DO UPDATE SET ${updateColumns.map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`).join(", ")}`;
    const returning = this.hasReturning ? ` RETURNING ${this.returningSql()}` : "";
    const sql = `INSERT INTO ${quoteIdentifier(this.table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES ${rowPlaceholders.join(", ")} ON CONFLICT (${conflictSql}) ${action}${returning}`;
    const result = await pool.query(sql, values);
    return this.mutationResponse(result.rows as Record<string, unknown>[]);
  }

  private async executeDelete() {
    const values: unknown[] = [];
    const where = whereSql(this.filters, values);
    const returning = this.hasReturning ? ` RETURNING ${this.returningSql()}` : "";
    const sql = `DELETE FROM ${quoteIdentifier(this.table)}${where}${returning}`;
    const result = await pool.query(sql, values);
    return this.mutationResponse(result.rows as Record<string, unknown>[]);
  }

  private returningSql() {
    const parsed = parseSelect(this.selectClause, this.table);
    if (parsed.embeds.length > 0) {
      return "*";
    }
    if (parsed.includeAll || parsed.columns.length === 0) {
      return "*";
    }
    return parsed.columns.map(quoteIdentifier).join(", ");
  }

  private async mutationResponse(rawRows: Record<string, unknown>[]) {
    if (!this.hasReturning) return rowsToResponse(null);

    const parsed = parseSelect(this.selectClause, this.table);
    const rows = rawRows.map((row) => projectRow(row, parsed));
    await this.hydrateEmbeds(rawRows, rows, parsed.embeds);
    return rowsToResponse(this.applySingleMode(rows));
  }
}

const storageRoot = resolve(process.cwd(), process.env.FILE_STORAGE_DIR || "uploads");

function safeStoragePath(bucket: string, key: string) {
  assertIdentifier(bucket);
  const bucketRoot = resolve(storageRoot, bucket);
  const targetPath = resolve(bucketRoot, key.replaceAll("\\", "/"));
  const relativePath = path.relative(bucketRoot, targetPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Invalid storage path");
  }
  return { bucketRoot, targetPath };
}

function publicStorageUrl(bucket: string, key: string) {
  const base =
    process.env.PUBLIC_STORAGE_URL ||
    process.env.APP_URL ||
    process.env.VITE_API_URL?.replace(/\/api\/?$/, "") ||
    "";
  const encodedKey = key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const relativeUrl = `/uploads/${bucket}/${encodedKey}`;
  return base ? `${base.replace(/\/$/, "")}${relativeUrl}` : relativeUrl;
}

export const db = {
  from(table: string) {
    return new PostgresQueryBuilder(table);
  },
  storage: {
    from(bucket: string) {
      return {
        async upload(key: string, body: Buffer | Uint8Array | string, _options: { contentType?: string; upsert?: boolean } = {}) {
          try {
            const { targetPath } = safeStoragePath(bucket, key);
            await fs.mkdir(path.dirname(targetPath), { recursive: true });
            await fs.writeFile(targetPath, body);
            return { data: { path: key }, error: null };
          } catch (error) {
            return { data: null, error: toQueryError(error) };
          }
        },
        getPublicUrl(key: string) {
          return { data: { publicUrl: publicStorageUrl(bucket, key) } };
        },
        async remove(keys: string[]) {
          const errors: Array<{ key: string; message: string }> = [];
          for (const key of keys) {
            try {
              const { targetPath } = safeStoragePath(bucket, key);
              await fs.unlink(targetPath);
            } catch (err: unknown) {
              const code = (err as NodeJS.ErrnoException).code;
              if (code !== "ENOENT") {
                errors.push({ key, message: (err as Error).message });
              }
            }
          }
          return { data: null, error: errors.length ? { message: errors.map(e => `${e.key}: ${e.message}`).join("; ") } : null };
        },
      };
    },
  },
};

/**
 * Run a callback inside a database transaction (BEGIN / COMMIT / ROLLBACK).
 * The callback receives a raw `pg.PoolClient` for direct queries.
 * If the callback throws, the transaction is rolled back automatically.
 */
export async function transaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Automatically records candidate pipeline stage transitions.
 * When a candidate transitions to a new stage:
 * 1. Mark any active prior stage for that candidate/job as exited (set exited_at = now()).
 * 2. Insert the new stage transition entry.
 */
export async function recordPipelineStage(
  candidateId: string,
  jobId: string,
  stage: string,
  notes?: string | null,
  updatedBy?: string | null
): Promise<void> {
  try {
    const nowStr = new Date().toISOString();
    
    // First, exit any existing stage for this candidate and job
    await pool.query(
      `UPDATE candidate_pipeline 
       SET exited_at = $1 
       WHERE candidate_id = $2 AND job_id = $3 AND exited_at IS NULL`,
      [nowStr, candidateId, jobId]
    );

    // Insert the new stage transition log
    // We use ON CONFLICT (candidate_id, job_id, stage) DO UPDATE to handle the UNIQUE constraint cleanly
    await pool.query(
      `INSERT INTO candidate_pipeline (candidate_id, job_id, stage, entered_at, exited_at, notes, updated_by)
       VALUES ($1, $2, $3, $4, NULL, $5, $6)
       ON CONFLICT (candidate_id, job_id, stage) 
       DO UPDATE SET entered_at = $4, exited_at = NULL, notes = $5, updated_by = $6`,
      [candidateId, jobId, stage, nowStr, notes || null, updatedBy || null]
    );
  } catch (err: any) {
    console.error(`Failed to record pipeline stage transition to "${stage}":`, err.message);
  }
}

export { EMPTY_UUID, storageRoot };

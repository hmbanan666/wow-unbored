import { AsyncLocalStorage } from "node:async_hooks";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";

import type { Sql } from "./postgres.ts";

/**
 * One async query surface over SQLite (`node:sqlite`) and PostgreSQL (ADR 0057).
 *
 * Queries are written once with `?` placeholders; Postgres gets `$1..$n`. Where
 * the dialects differ the caller asks `db.pg` or uses the helpers below
 * (`greatest`, `least`, `body`). JSON goes in as `JSON.stringify` text (Postgres
 * casts it to jsonb) and comes out through `fromJson`, which takes text or an
 * already parsed jsonb value.
 *
 * `tx(work)` runs `work` in one transaction. Every query made from inside it,
 * however deep, joins that transaction (AsyncLocalStorage), so callers do not
 * thread a handle through. A timer or promise started inside a transaction
 * that runs after it ended uses the pool again. On SQLite (one connection) a
 * transaction holds a lock: queries from outside wait until it ends, so no
 * other request's statement lands inside it.
 */
export type Param = string | number | null | Uint8Array;
export type Row = Record<string, unknown>;

export interface Db {
  readonly pg: boolean;
  all<T = Row>(query: string, ...params: Param[]): Promise<T[]>;
  get<T = Row>(query: string, ...params: Param[]): Promise<T | undefined>;
  /** Rows changed. */
  run(query: string, ...params: Param[]): Promise<number>;
  tx<T>(work: () => Promise<T>): Promise<T>;
  /**
   * Inside a transaction: `work` may fail without failing the transaction
   * (Postgres aborts a transaction on any error otherwise). SQLite just runs it.
   */
  savepoint<T>(work: () => Promise<T>): Promise<T>;
  /** True while the calling code runs inside `tx`. */
  readonly inTx: boolean;
  /** The JSON body column: `body_json` (TEXT) on SQLite, `body` (jsonb) on Postgres. */
  readonly body: string;
  greatest(a: string, b: string): string;
  least(a: string, b: string): string;
  /** Serializes concurrent writers of one key until the transaction ends (Postgres only). */
  lockKey(key: string): Promise<void>;
  close(): void;
}

/** Parses a JSON column: SQLite gives text, Postgres jsonb is already parsed. */
export function fromJson<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function toPositional(query: string): string {
  let n = 0;
  return query.replace(/\?/g, () => `$${++n}`);
}

type Scope = { owner: object; open: boolean; handle?: unknown };

export class SqliteDb implements Db {
  readonly pg = false;
  readonly body = "body_json";
  readonly raw: DatabaseSync;
  private scopes = new AsyncLocalStorage<Scope>();
  private held: Scope | undefined;
  private waiters: (() => void)[] = [];
  private closing = false;

  constructor(raw: DatabaseSync) {
    this.raw = raw;
  }

  get inTx(): boolean {
    return this.current() !== undefined;
  }

  greatest(a: string, b: string) {
    return `MAX(${a}, ${b})`;
  }

  least(a: string, b: string) {
    return `MIN(${a}, ${b})`;
  }

  async lockKey(): Promise<void> {
    // One connection and the transaction lock already serialize writers.
  }

  private current(): Scope | undefined {
    const scope = this.scopes.getStore();
    return scope && scope.owner === this && scope.open ? scope : undefined;
  }

  /** Another transaction holds the connection. Checked in the same tick as the statement runs. */
  private blocked(): boolean {
    return this.held !== undefined && this.held !== this.current();
  }

  private wait(): Promise<void> {
    return new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  async all<T = Row>(query: string, ...params: Param[]): Promise<T[]> {
    while (this.blocked()) await this.wait();
    return this.raw.prepare(query).all(...(params as SQLInputValue[])) as T[];
  }

  async get<T = Row>(query: string, ...params: Param[]): Promise<T | undefined> {
    while (this.blocked()) await this.wait();
    return this.raw.prepare(query).get(...(params as SQLInputValue[])) as T | undefined;
  }

  async run(query: string, ...params: Param[]): Promise<number> {
    while (this.blocked()) await this.wait();
    return Number(this.raw.prepare(query).run(...(params as SQLInputValue[])).changes);
  }

  async tx<T>(work: () => Promise<T>): Promise<T> {
    if (this.current()) return work();
    while (this.held) await this.wait();
    // Taken in the same tick as the check above: nothing can slip between.
    const scope: Scope = { owner: this, open: true };
    this.held = scope;
    try {
      this.raw.exec("BEGIN");
      const out = await this.scopes.run(scope, work);
      this.raw.exec("COMMIT");
      return out;
    } catch (error) {
      if (this.raw.isTransaction) this.raw.exec("ROLLBACK");
      throw error;
    } finally {
      scope.open = false;
      this.held = undefined;
      if (this.closing) this.raw.close();
      const waiting = this.waiters.splice(0);
      for (const resolve of waiting) resolve();
    }
  }

  savepoint<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }

  /** Closes now, or when the running transaction (the startup backfill, say) ends. */
  close(): void {
    if (this.held) this.closing = true;
    else if (this.raw.isOpen) this.raw.close();
  }
}

export class PostgresDb implements Db {
  readonly pg = true;
  readonly body = "body";
  readonly sql: Sql;
  private scopes = new AsyncLocalStorage<Scope>();

  constructor(sql: Sql) {
    this.sql = sql;
  }

  get inTx(): boolean {
    return this.current() !== undefined;
  }

  greatest(a: string, b: string) {
    return `GREATEST(${a}, ${b})`;
  }

  least(a: string, b: string) {
    return `LEAST(${a}, ${b})`;
  }

  private current(): Scope | undefined {
    const scope = this.scopes.getStore();
    return scope && scope.owner === this && scope.open ? scope : undefined;
  }

  /** The transaction of the calling code, else the pool. */
  handle(): Sql {
    return (this.current()?.handle as Sql | undefined) ?? this.sql;
  }

  async lockKey(key: string): Promise<void> {
    if (!this.current()) throw new Error("lockKey needs a transaction.");
    await this.handle().unsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, [key]);
  }

  async all<T = Row>(query: string, ...params: Param[]): Promise<T[]> {
    const rows = await this.handle().unsafe(toPositional(query), params as never[]);
    return [...rows] as T[];
  }

  async get<T = Row>(query: string, ...params: Param[]): Promise<T | undefined> {
    return (await this.all<T>(query, ...params))[0];
  }

  async run(query: string, ...params: Param[]): Promise<number> {
    const result = await this.handle().unsafe(toPositional(query), params as never[]);
    return result.count ?? 0;
  }

  async tx<T>(work: () => Promise<T>): Promise<T> {
    if (this.current()) return work();
    return (await this.sql.begin(async (tx) => {
      const scope: Scope = { owner: this, open: true, handle: tx };
      try {
        return await this.scopes.run(scope, work);
      } finally {
        scope.open = false;
      }
    })) as T;
  }

  async savepoint<T>(work: () => Promise<T>): Promise<T> {
    const outer = this.current();
    if (!outer) return work();
    const tx = outer.handle as { savepoint: (fn: (sp: Sql) => Promise<T>) => Promise<T> };
    return tx.savepoint(async (sp) => {
      const scope: Scope = { owner: this, open: true, handle: sp };
      try {
        return await this.scopes.run(scope, work);
      } finally {
        scope.open = false;
      }
    });
  }

  close(): void {
    // The caller owns the pool (index.ts, tests).
  }
}

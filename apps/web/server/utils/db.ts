import postgres from "postgres";

/**
 * The same Postgres as the Server (ADR 0073). The site reads `web` and
 * `content`, and later the player's own rows. It does not copy them.
 */
const epochSeconds = {
  to: 20,
  from: [20],
  serialize: (value: number) => String(value),
  parse: (value: string) => Number(value),
};

export type Sql = ReturnType<typeof postgres>;

let sql: Sql | undefined;
let logged = false;

export function db(): Sql | undefined {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    if (!logged) {
      logged = true;
      console.error("DATABASE_URL is unset; the site has no pages to read.");
    }
    return undefined;
  }
  if (!sql) {
    const max = Number(process.env.DATABASE_POOL_MAX ?? "4");
    sql = postgres(url, {
      max: Number.isInteger(max) && max >= 1 && max <= 20 ? max : 4,
      onnotice: () => {},
      types: { bigint: epochSeconds },
    });
  }
  return sql;
}

export async function closeDb(): Promise<void> {
  await sql?.end();
  sql = undefined;
}

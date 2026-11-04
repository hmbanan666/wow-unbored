import type { H3Event } from "h3";

import { browserLang, SIGN_IN_COPY, type PageLang } from "#shared/sign-in";
import { db, type Sql } from "./db";

export type LiveAccount = { accountId: string; lang: PageLang };

/** The sealed session is live only while its row is still open for that Account. */
export async function sessionIsLive(
  sql: Sql,
  sessionId: string,
  accountId: string,
): Promise<boolean> {
  const [row] = await sql<{ account_id: string }[]>`
    SELECT account_id FROM web.sessions
    WHERE id = ${sessionId} AND ended_at IS NULL`;
  return row?.account_id === accountId;
}

export async function liveAccount(event: H3Event): Promise<LiveAccount | undefined> {
  const lang = browserLang(getRequestHeader(event, "accept-language"));
  const session = await getUserSession(event);
  const user = session.user;
  const sql = db();
  if (!user?.sessionId || !user.accountId || !sql) return undefined;
  if (!(await sessionIsLive(sql, user.sessionId, user.accountId))) {
    await clearUserSession(event);
    return undefined;
  }
  return { accountId: user.accountId, lang };
}

export function signedOutLine(lang: PageLang, closed: boolean): string {
  return closed ? SIGN_IN_COPY[lang].closed : SIGN_IN_COPY[lang].missing;
}

import type { H3Event } from "h3";

import { browserLang, SESSION_DAYS, SIGN_IN_COPY, type PageLang } from "#shared/sign-in";
import { db, type Sql } from "./db";

export type LiveAccount = { accountId: string; lang: PageLang };

/**
 * The sealed session is live only while its row is still open for that Account,
 * younger than SESSION_DAYS, and the PC that opened it is still connected.
 */
export async function sessionIsLive(
  sql: Sql,
  sessionId: string,
  accountId: string,
  now = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const [row] = await sql<{ account_id: string }[]>`
    SELECT s.account_id FROM web.sessions s
    JOIN devices d ON d.id = s.device_id AND d.status = 'approved'
    WHERE s.id = ${sessionId} AND s.ended_at IS NULL
      AND s.created_at > ${now - SESSION_DAYS * 86400}`;
  return row?.account_id === accountId;
}

export async function liveAccount(event: H3Event): Promise<LiveAccount | undefined> {
  const lang = browserLang(getRequestHeader(event, "accept-language"));
  const session = await getUserSession(event);
  const user = sessionCredentials(session);
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

/** Keep existing sealed cookies working while new ones use server-only session data. */
export function sessionCredentials(session: {
  secure?: { sessionId: string; accountId: string };
  user?: { sessionId?: string; accountId?: string };
}) {
  return session.secure ?? session.user;
}

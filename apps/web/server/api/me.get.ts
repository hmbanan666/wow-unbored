import { MY_PAGE_COPY } from "#shared/my-page";
import { browserLang, SIGN_IN_COPY } from "#shared/sign-in";
import { readMyPage } from "../utils/account-page";
import { db } from "../utils/db";
import { liveAccount } from "../utils/session";

export default defineEventHandler(async (event) => {
  const lang = browserLang(getRequestHeader(event, "accept-language"));
  const prior = await getUserSession(event);
  const account = await liveAccount(event);
  if (!account) {
    const closed = Boolean(prior.user);
    return {
      ok: false as const,
      lang,
      closed,
      message: closed ? SIGN_IN_COPY[lang].closed : SIGN_IN_COPY[lang].missing,
    };
  }
  const sql = db();
  if (!sql) {
    return { ok: false as const, lang, closed: false, message: SIGN_IN_COPY[lang].failed };
  }
  const page = await readMyPage(sql, account.accountId, account.lang);
  return { ok: true as const, lang: account.lang, ...page, copy: MY_PAGE_COPY[account.lang] };
});

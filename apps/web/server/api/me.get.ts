import { MY_PAGE_COPY } from "#shared/my-page";
import { SIGN_IN_COPY } from "#shared/sign-in";
import { readMyPage } from "../utils/account-page";
import { db } from "../utils/db";
import { liveAccount, signedOutLine } from "../utils/session";

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "private, no-store");
  const prior = await getUserSession(event);
  const account = await liveAccount(event);
  if (!account) {
    const closed = Boolean(prior.user);
    return {
      ok: false as const,
      closed,
      message: signedOutLine(closed),
    };
  }
  const sql = db();
  if (!sql) {
    return { ok: false as const, closed: false, message: SIGN_IN_COPY.failed };
  }
  const page = await readMyPage(sql, account.accountId);
  return { ok: true as const, ...page, copy: MY_PAGE_COPY };
});

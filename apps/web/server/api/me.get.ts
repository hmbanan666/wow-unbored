import { browserLang, SIGN_IN_COPY } from "#shared/sign-in";
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
  return { ok: true as const, lang: account.lang };
});

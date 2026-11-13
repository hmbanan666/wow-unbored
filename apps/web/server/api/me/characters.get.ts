import { db } from "../../utils/db";
import { liveAccount } from "../../utils/session";
import { readPickerCharacters } from "../../utils/selected-character";
export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "private, no-store");
  setResponseHeader(event, "x-robots-tag", "noindex");
  const account = await liveAccount(event);
  if (!account) return { signedIn: false, characters: [] };
  return { signedIn: true, characters: await readPickerCharacters(db()!, account.accountId) };
});

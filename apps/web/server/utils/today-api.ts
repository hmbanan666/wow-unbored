import type { CharacterIdentity } from "#shared/character-page";
import type { TodaySet } from "@unbored/contracts/today-goals";
/** The Server owns creation and ticking; only a sealed website session supplies this credential. */
export async function fetchTodaySets(
  serverUrl: string,
  sessionId: string | undefined,
  character: CharacterIdentity,
  transport: typeof fetch = fetch,
): Promise<TodaySet[] | null> {
  if (!sessionId) return null;
  try {
    const query = new URLSearchParams({
      game: character.game,
      realm: character.realm,
      character: character.name,
    });
    const response = await transport(`${serverUrl.replace(/\/$/, "")}/v1/web/today?${query}`, {
      headers: { authorization: `Bearer ${sessionId}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    return ((await response.json()) as { sets: TodaySet[] }).sets;
  } catch {
    return null;
  }
}

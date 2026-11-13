import {
  CHARACTER_COOKIE,
  CHARACTER_COOKIE_AGE,
  characterKey,
  parseCharacter,
  type PickerCharacter,
} from "#shared/selected-character";

/** Initialized identically during SSR. Neither sessions nor selection cookies are read until mount. */
export function useSelectedCharacter() {
  const state = useState("character-picker", () => ({
    status: "idle" as "idle" | "loading" | "ready" | "error",
    signedIn: false,
    characters: [] as PickerCharacter[],
    selected: "",
  }));
  const selected = computed(
    () => state.value.characters.find((c) => characterKey(c) === state.value.selected) ?? null,
  );
  function choose(value: string) {
    state.value.selected = state.value.characters.some((c) => characterKey(c) === value)
      ? value
      : "";
    document.cookie = `${CHARACTER_COOKIE}=${encodeURIComponent(state.value.selected)}; Path=/; SameSite=Lax; Max-Age=${CHARACTER_COOKIE_AGE}${location.protocol === "https:" ? "; Secure" : ""}`;
  }
  async function refresh() {
    state.value.status = "loading";
    // Clear personal state immediately on refresh/sign-out or a failed session check.
    state.value.characters = [];
    state.value.selected = "";
    try {
      const result = await $fetch<{ signedIn: boolean; characters: PickerCharacter[] }>(
        "/api/me/characters",
        { cache: "no-store" },
      );
      state.value.signedIn = result.signedIn;
      state.value.characters = result.characters;
      const raw = document.cookie
        .split("; ")
        .find((c) => c.startsWith(`${CHARACTER_COOKIE}=`))
        ?.split("=")
        .slice(1)
        .join("=");
      let saved = null;
      try {
        saved = parseCharacter(raw ? decodeURIComponent(raw) : "");
      } catch {
        /* malformed cookies select nothing */
      }
      const key = saved ? characterKey(saved) : "";
      state.value.selected = result.characters.some((c) => characterKey(c) === key) ? key : "";
      state.value.status = "ready";
    } catch {
      state.value.status = "error";
    }
  }
  onMounted(() => {
    if (state.value.status === "idle") void refresh();
  });
  return { state, selected, choose, refresh };
}

import { characterKey } from "#shared/selected-character";
import type { Game } from "#shared/public-professions";
import { useSelectedCharacter } from "./useSelectedCharacter";
export function useProfessionOverlay<T>(
  kind: "professions" | "recipes" | "quests" | "quest-chains",
  game: () => Game,
  slug: () => string,
) {
  const { selected } = useSelectedCharacter();
  const data = ref<T | null>(null);
  const status = ref<"idle" | "loading" | "ready" | "error">("idle");
  const mounted = ref(false);
  const otherGame = computed(() => selected.value !== null && selected.value.game !== game());
  let controller: AbortController | undefined;
  let generation = 0;
  async function refresh() {
    const version = ++generation;
    controller?.abort();
    data.value = null;
    status.value = "idle";
    if (!mounted.value || !selected.value || otherGame.value) return;
    controller = new AbortController();
    status.value = "loading";
    try {
      const result = await $fetch<T>(
        `/api/me/overlay/${kind}/${game()}/${encodeURIComponent(slug())}`,
        {
          query: { character: characterKey(selected.value) },
          cache: "no-store",
          signal: controller.signal,
        },
      );
      if (version === generation) {
        data.value = result;
        status.value = "ready";
      }
    } catch {
      if (version === generation) status.value = "error";
    }
  }
  watch(() => [selected.value, game(), slug()], refresh);
  onMounted(() => {
    mounted.value = true;
    void refresh();
  });
  onBeforeUnmount(() => {
    generation++;
    controller?.abort();
  });
  return { data, status, otherGame, selected, refresh };
}

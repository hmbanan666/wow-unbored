import { PATH_COPY, type PersonalPaths } from "#shared/personal-paths";
import { browserLang, SIGN_IN_COPY } from "#shared/sign-in";

/** Mounted fetches only: personal data never enters a public SSR payload. */
export function usePaths() {
  const data = ref<PersonalPaths | null>(null);
  const lang = ref<"en" | "ru">("en");
  const copy = computed(() => PATH_COPY[lang.value]);
  const loading = ref(true);
  const signedOut = ref(false);
  const message = ref("");
  async function refresh() {
    loading.value = true;
    message.value = "";
    data.value = null;
    try {
      data.value = await $fetch<PersonalPaths>("/api/paths/progress");
      signedOut.value = false;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      signedOut.value = status === 401;
      message.value = status === 401 ? SIGN_IN_COPY[lang.value].missing : copy.value.failed;
    } finally {
      loading.value = false;
    }
  }
  onMounted(() => {
    lang.value = browserLang(navigator.languages.join(","));
    void refresh();
  });
  return { data, lang, copy, loading, signedOut, message, refresh };
}

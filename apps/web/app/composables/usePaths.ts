import { PATH_COPY, type PersonalPaths } from "#shared/personal-paths";
import { SIGN_IN_COPY } from "#shared/sign-in";

/** Mounted fetches only: personal data never enters a public SSR payload. */
export function usePaths() {
  const data = ref<PersonalPaths | null>(null);
  const copy = PATH_COPY;
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
      message.value = status === 401 ? SIGN_IN_COPY.missing : copy.failed;
    } finally {
      loading.value = false;
    }
  }
  onMounted(() => {
    void refresh();
  });
  return { data, copy, loading, signedOut, message, refresh };
}

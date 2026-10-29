export type WebhookConfig = {
  url: string;
  key: string;
  headerName: string;
};

export function webhookFromEnv(env: NodeJS.ProcessEnv = process.env): WebhookConfig {
  return {
    url: env.UNBORED_PLANNER_WEBHOOK_URL?.trim() ?? "",
    key: env.UNBORED_PLANNER_WEBHOOK_KEY?.trim() ?? "",
    headerName: env.UNBORED_PLANNER_WEBHOOK_KEY_HEADER?.trim() ?? "",
  };
}

export type WebhookBody = {
  requestId: string;
  character: string;
  realm: string;
  mode: string;
  budget: number;
  wish: string | null;
};

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number }>;

export async function postWebhook(
  config: WebhookConfig,
  body: WebhookBody,
  fetchImpl: FetchLike = fetch,
  attempts = 3,
): Promise<boolean> {
  if (!config.url) return false;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (config.key) {
    headers.authorization = `Bearer ${config.key}`;
    const name = config.headerName;
    if (name && name.toLowerCase() !== "authorization") {
      headers[name] = config.key;
    }
  }
  const payload = JSON.stringify(body);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchImpl(config.url, { method: "POST", headers, body: payload });
      if (response.ok) return true;
    } catch {
      // try again
    }
  }
  return false;
}

import { sha256Hex } from "./auth.ts";

export const PENDING_CAP = 20;
export const REGISTER_LIMIT = 10;
export const REGISTER_WINDOW_MS = 10 * 60 * 1000;

const DEVICE_ID = /^[A-Za-z0-9_-]{8,80}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;

export function cleanRegistration(raw: unknown):
  | { id: string; name: string; secretHash: string }
  | { error: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { error: "Registration must be a JSON object." };
  }
  const body = raw as Record<string, unknown>;
  const id = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
  if (!DEVICE_ID.test(id)) {
    return { error: "deviceId must be 8 to 80 letters, digits, underscores, or hyphens." };
  }
  const nameRaw = typeof body.name === "string" ? body.name.trim() : "";
  const name = (nameRaw || "companion").slice(0, 80);
  let secretHash = "";
  if (typeof body.secret === "string" && body.secret.length >= 16) {
    secretHash = sha256Hex(body.secret);
  } else if (typeof body.secretHash === "string") {
    secretHash = body.secretHash.trim().toLowerCase();
  }
  if (!SHA256_HEX.test(secretHash)) {
    return { error: "Send secret (at least 16 characters) or secretHash as 64 hex characters." };
  }
  return { id, name, secretHash };
}

export class RegisterLimiter {
  private hits = new Map<string, number[]>();

  allow(ip: string, now = Date.now()): boolean {
    const recent = (this.hits.get(ip) ?? []).filter((at) => now - at < REGISTER_WINDOW_MS);
    if (recent.length >= REGISTER_LIMIT) {
      this.hits.set(ip, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(ip, recent);
    return true;
  }
}

export function clientIp(forwardedFor: string | undefined, realIp: string | undefined): string {
  const forwarded = forwardedFor?.split(",")[0]?.trim() ?? "";
  const ip = forwarded || realIp?.trim() || "local";
  return ip.slice(0, 80);
}

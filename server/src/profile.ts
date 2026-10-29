import { PlanError } from "./plan.ts";

// docs/adr/0011: the Companion uploads the player state the addon saved, so
// the Planner can read one up-to-date profile instead of asking each time.
export const PROFILE_MAX_BYTES = 512 * 1024;

export type ProfileUpload = {
  character: string;
  realm: string;
  /** The WoW account folder the character lives in; links Alts (docs/adr/0021). */
  account: string;
  savedAt: number | null;
  profile: Record<string, unknown>;
};

function name(value: unknown, field: string, required: boolean): string {
  if (value === undefined || value === null || value === "") {
    if (required) throw new PlanError(`${field} is required.`);
    return "";
  }
  if (typeof value !== "string") throw new PlanError(`${field} must be text.`);
  const trimmed = value.trim();
  if (Buffer.byteLength(trimmed) > 80) throw new PlanError(`${field} is too long.`);
  if (required && !trimmed) throw new PlanError(`${field} is required.`);
  return trimmed;
}

export function cleanProfile(body: unknown): ProfileUpload {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new PlanError("The profile must be an object.");
  }
  const raw = body as Record<string, unknown>;
  const profile = raw.profile;
  if (typeof profile !== "object" || profile === null || Array.isArray(profile)) {
    throw new PlanError("profile must be an object.");
  }
  if (Buffer.byteLength(JSON.stringify(profile)) > PROFILE_MAX_BYTES) {
    throw new PlanError("The profile is too large.");
  }
  const savedAt = Number(raw.savedAt);
  return {
    character: name(raw.character, "character", true),
    realm: name(raw.realm, "realm", false),
    account: name(raw.account, "account", false),
    savedAt: Number.isInteger(savedAt) && savedAt > 0 ? savedAt : null,
    profile: profile as Record<string, unknown>,
  };
}

export type PhoneLink =
  | { ok: true; url: string; expiresAt: number }
  | { ok: false; message: string };

export const PHONE_COPY = {
  open: "Open on phone",
  loading: "Preparing your sign-in link…",
  scan: "Scan with your phone's camera to open your page.",
  expires: "This link works once and expires in 10 minutes. Keep it to yourself.",
  expired: "This link has expired. Make a new one to open your page.",
  fresh: "Make a new link",
  close: "Close",
  link: "Sign-in link",
  copy: "Copy",
  copied: "Copied. Open it on your phone.",
  copyFailed: "Couldn't copy. Select the link and copy it yourself.",
  failed: "Bory couldn't prepare the link. Try again in a moment.",
  limited: "You've opened several links. Wait a few minutes, then try again.",
  closed: "Open my profile from the Companion to sign in again.",
} as const;

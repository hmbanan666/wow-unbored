/** Authored game references shared by the Server and website (ADR 0077). */
export const MEDIA_KINDS = [
  "mount",
  "pet",
  "achievement",
  "item",
  "toy",
  "currency",
  "instance",
] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];
export type MediaRef = { kind: MediaKind; id: number };
export type MediaOverrides = { icon?: number; display?: number };
export type Hero =
  | { kind: "mount" | "pet" | "instance"; id: number; alt?: string }
  | { image: string; alt: string };
export type Figure = { type: "figure"; alt: string; caption?: string } & (
  | { ref: MediaRef; image?: never }
  | { image: string; ref?: never }
);
export type MediaVariant = { file: string; width: number; height: number; format: "avif" | "webp" };
export type MediaAsset = {
  variants: MediaVariant[];
  width: number;
  height: number;
  alt: string;
  name: string;
};
/** Own images use `image:<hash>`; game assets use `<kind>:<id>`. */
export type PageMedia = Record<
  string,
  Partial<Record<"icon" | "render" | "tile" | "image", MediaAsset>>
>;
export const MEDIA_FILE = /^[0-9a-f]{16}-\d{2,4}\.(avif|webp)$/;
const HASH = /^[0-9a-f]{16}$/;
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const id = (v: unknown): v is number => Number.isInteger(v) && Number(v) > 0 && Number(v) < 2 ** 31;
const text = (v: unknown, max = 500): v is string =>
  typeof v === "string" && !!v.trim() && v.length <= max;

export function cleanMediaRef(v: unknown): MediaRef | undefined {
  if (!object(v) || !MEDIA_KINDS.includes(v.kind as MediaKind) || !id(v.id)) return;
  return { kind: v.kind as MediaKind, id: v.id };
}
export function cleanMediaOverrides(v: unknown): MediaOverrides | undefined {
  if (
    !object(v) ||
    (v.icon !== undefined && !id(v.icon)) ||
    (v.display !== undefined && !id(v.display))
  )
    return;
  return {
    ...(v.icon !== undefined ? { icon: v.icon as number } : {}),
    ...(v.display !== undefined ? { display: v.display as number } : {}),
  };
}
export function cleanHero(v: unknown): Hero | undefined {
  if (!object(v)) return;
  if (v.image !== undefined) {
    if (
      v.kind !== undefined ||
      v.id !== undefined ||
      typeof v.image !== "string" ||
      !HASH.test(v.image) ||
      !text(v.alt)
    )
      return;
    return { image: v.image, alt: v.alt };
  }
  const ref = cleanMediaRef(v);
  if (
    !ref ||
    !["mount", "pet", "instance"].includes(ref.kind) ||
    (v.alt !== undefined && !text(v.alt))
  )
    return;
  return {
    kind: ref.kind as "mount" | "pet" | "instance",
    id: ref.id,
    ...(v.alt !== undefined ? { alt: v.alt as string } : {}),
  };
}
export function cleanFigure(v: unknown): Figure | undefined {
  if (
    !object(v) ||
    v.type !== "figure" ||
    !text(v.alt) ||
    (v.caption !== undefined && !text(v.caption, 2000))
  )
    return;
  const ref = cleanMediaRef(v.ref);
  const own = typeof v.image === "string" && HASH.test(v.image);
  if ((v.ref !== undefined && v.image !== undefined) || (!ref && !own)) return;
  return {
    type: "figure",
    ...(ref ? { ref } : { image: v.image as string }),
    alt: v.alt,
    ...(v.caption !== undefined ? { caption: v.caption as string } : {}),
  };
}
/** Reject unmatched delimiters and unknown kinds; plain prose remains untouched. */
export function inlineMedia(text: string): MediaRef[] {
  const refs: MediaRef[] = [];
  const rest = text.replace(/\[\[([^[\]]*)\]\]/g, (full: string, token: string, offset: number) => {
    if (text[offset - 1] === "[" || text[offset + full.length] === "]")
      throw new Error("Invalid inline game reference");
    const match = /^(mount|pet|achievement|item|toy|currency):([1-9]\d*)$/.exec(token);
    const ref = match && cleanMediaRef({ kind: match[1], id: Number(match[2]) });
    if (!ref) throw new Error("Invalid inline game reference");
    refs.push(ref);
    return "";
  });
  if (rest.includes("[[") || rest.includes("]]")) throw new Error("Invalid inline game reference");
  return refs;
}
export type MediaRequest = MediaRef & { name?: string; media?: MediaOverrides };
/** One reference per page; authored item names and overrides take precedence. */
export function pageMediaRefs(body: {
  items?: unknown[];
  blocks?: unknown[];
  hero?: unknown;
  terms?: unknown[];
}) {
  const refs = new Map<string, MediaRequest>();
  const images = new Set<string>();
  const add = (ref: MediaRequest) =>
    refs.set(`${ref.kind}:${ref.id}`, { ...refs.get(`${ref.kind}:${ref.id}`), ...ref });
  for (const term of body.terms ?? []) {
    if (object(term) && typeof term.icon === "string" && HASH.test(term.icon))
      images.add(term.icon);
  }
  const hero = cleanHero(body.hero);
  if (hero) {
    if ("image" in hero) images.add(hero.image);
    else add(hero);
  }
  for (const block of body.blocks ?? []) {
    if (!object(block)) continue;
    const figure = cleanFigure(block);
    if (figure) {
      if (figure.ref) add(figure.ref);
      else images.add(figure.image);
    }
    const lines =
      block.type === "paragraph"
        ? [block.text]
        : block.type === "list" && Array.isArray(block.items)
          ? block.items
          : [];
    for (const line of lines) {
      if (typeof line !== "string") continue;
      try {
        for (const ref of inlineMedia(line)) add(ref);
      } catch {
        /* Old malformed prose has no media. */
      }
    }
  }
  for (const item of body.items ?? []) {
    const ref = cleanMediaRef(item);
    if (!ref || !object(item)) continue;
    add({
      ...ref,
      ...(text(item.name) ? { name: item.name } : {}),
      ...(cleanMediaOverrides(item.media) ? { media: cleanMediaOverrides(item.media) } : {}),
    });
  }
  return { refs: [...refs.values()], images: [...images] };
}

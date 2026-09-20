export const MAX_REELS = 6;
export const MAX_CAPTION = 300;

type ReelMeta = {
  /** https image link used as the card cover. */
  thumbnail?: string;
  caption?: string;
  /** YYYY-MM-DD. Shown as "7 months ago". */
  postedAt?: string;
};

export type InstagramReel = ReelMeta & {
  kind: "instagram";
  path: "reel" | "p" | "tv";
  id: string;
  url: string;
};
export type VideoReel = ReelMeta & { kind: "video"; url: string };
export type ReelItem = InstagramReel | VideoReel;

const IG_RE =
  /^https?:\/\/(?:www\.)?instagram\.com\/(?:[A-Za-z0-9._]+\/)?(reels?|p|tv)\/([A-Za-z0-9_-]{5,})/i;
const VIDEO_RE = /^https:\/\/\S+\.(?:mp4|webm)(?:\?\S*)?$/i;
const IMAGE_RE = /^https:\/\/\S+$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Accepts a plain URL string (legacy `instagram_reels` rows) or an object
 * `{ url, thumbnail?, caption?, posted_at? }` (the `reels` jsonb column).
 */
export function parseReel(raw: unknown): ReelItem | null {
  const obj: Record<string, unknown> | null =
    typeof raw === "string"
      ? { url: raw }
      : raw && typeof raw === "object"
        ? (raw as Record<string, unknown>)
        : null;
  if (!obj || typeof obj.url !== "string") return null;

  const url = obj.url.trim();

  const meta: ReelMeta = {};
  if (typeof obj.thumbnail === "string") {
    const t = obj.thumbnail.trim();
    if (t.length <= 500 && IMAGE_RE.test(t)) meta.thumbnail = t;
  }
  if (typeof obj.caption === "string" && obj.caption.trim()) {
    meta.caption = obj.caption.trim().slice(0, MAX_CAPTION);
  }
  if (
    typeof obj.posted_at === "string" &&
    DATE_RE.test(obj.posted_at) &&
    !Number.isNaN(Date.parse(obj.posted_at))
  ) {
    meta.postedAt = obj.posted_at;
  }

  const ig = url.match(IG_RE);
  if (ig) {
    const p = ig[1].toLowerCase();
    const path = (p === "reels" ? "reel" : p) as "reel" | "p" | "tv";
    return { kind: "instagram", path, id: ig[2], url, ...meta };
  }

  if (VIDEO_RE.test(url)) return { kind: "video", url, ...meta };
  return null;
}

/** Keeps only valid, unique items (max 6), in the order given. */
export function parseReels(list: unknown): ReelItem[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: ReelItem[] = [];

  for (const raw of list) {
    const item = parseReel(raw);
    if (!item) continue;

    const key = item.kind === "instagram" ? `${item.path}/${item.id}` : item.url;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push(item);
    if (out.length >= MAX_REELS) break;
  }
  return out;
}

/** "today", "3 days ago", "2 weeks ago", "7 months ago", "a year ago". */
export function timeAgo(iso?: string, now: number = Date.now()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;

  const days = Math.floor((now - t) / 86_400_000);
  if (days < 1) return "today";
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (days < 30) {
    const w = Math.floor(days / 7);
    return `${w} week${w === 1 ? "" : "s"} ago`;
  }
  if (days < 365) {
    const m = Math.max(1, Math.floor(days / 30));
    return `${m} month${m === 1 ? "" : "s"} ago`;
  }
  const y = Math.floor(days / 365);
  return y === 1 ? "a year ago" : `${y} years ago`;
}

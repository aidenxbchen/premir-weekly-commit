import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Feishu avatar URLs are hotlinked to their CDN today — every page load
// re-fetches every visible avatar straight from Feishu instead of once.
// This downloads each person's avatar exactly once (skips anyone already
// on disk) and serves it back from our own server after that, so normal
// usage never touches Feishu's image CDN again for a person whose avatar
// hasn't changed. Not a refresh cache — if someone changes their Feishu
// avatar, the cached copy just keeps being served; that's an acceptable
// trade for "don't refetch on every page load," and can be revisited if
// stale avatars ever become a real complaint.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const AVATAR_DIR = path.join(__dirname, "../../data/avatars");

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function existingCachedFile(openId: string): string | undefined {
  for (const ext of Object.values(EXT_BY_CONTENT_TYPE)) {
    if (existsSync(path.join(AVATAR_DIR, `${openId}.${ext}`))) return `${openId}.${ext}`;
  }
  return undefined;
}

// Returns the local served path (e.g. "/avatars/ou_xxx.jpg") if this
// person's avatar is already cached on disk — undefined otherwise, so the
// caller can fall back to the live Feishu URL for anyone not cached yet.
export function getCachedAvatarUrl(openId: string): string | undefined {
  const file = existingCachedFile(openId);
  return file ? `/avatars/${file}` : undefined;
}

// Downloads and caches one avatar if it isn't already on disk. Best-effort
// — a failed download just means this person keeps falling back to the
// live Feishu URL until the next sync cycle tries again.
export async function cacheAvatar(openId: string, sourceUrl: string): Promise<void> {
  if (existingCachedFile(openId)) return;
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) return;
    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    const ext = EXT_BY_CONTENT_TYPE[contentType] ?? "jpg";
    const buffer = Buffer.from(await res.arrayBuffer());
    mkdirSync(AVATAR_DIR, { recursive: true });
    writeFileSync(path.join(AVATAR_DIR, `${openId}.${ext}`), buffer);
  } catch (err) {
    console.error(`[avatarCache] failed to cache ${openId}:`, err);
  }
}

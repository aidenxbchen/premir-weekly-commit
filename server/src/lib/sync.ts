import { config } from "../config.js";
import { cacheAvatar, getCachedAvatarUrl } from "./avatarCache.js";
import { searchAll, type Fields } from "./bitable.js";
import { getRoster, replaceAvatars, replaceCollection, type StoredRecord } from "./store.js";

type UserFieldEntry = { id?: string; avatar_url?: string };

function extractAvatar(fields: Fields, fieldName: string): [string, string] | undefined {
  const entry = (fields[fieldName] as UserFieldEntry[] | undefined)?.[0];
  return entry?.id && entry.avatar_url ? [entry.id, entry.avatar_url] : undefined;
}

function withIds(items: Array<{ record_id?: string; fields: Fields }>): StoredRecord[] {
  return items.filter((i): i is StoredRecord => !!i.record_id);
}

const SYNC_INTERVAL_MS = 45_000;

// Full resync from Bitable into the local store. Runs on startup and on a
// timer — never on the request path, so a page load is never blocked on
// (or broken by) a live Feishu call. Avatars are derived from the same
// records rather than a separate scan, since every table that embeds a
// user field is already being pulled here anyway.
export async function syncAll(): Promise<void> {
  const avatarMap: Record<string, string> = {};
  const addAvatar = (e?: [string, string]) => {
    if (e && !avatarMap[e[0]]) avatarMap[e[0]] = e[1];
  };

  const [milestoneItems, ratingItems, ...commitmentSets] = await Promise.all([
    searchAll(config.tables.milestones, []),
    searchAll(config.tables.ratings, []),
    ...Object.values(config.tables.commitmentsByModule).map((tableId) => searchAll(tableId, [])),
  ]);

  const milestones = withIds(milestoneItems);
  replaceCollection("milestones", milestones);
  milestones.forEach((r) => addAvatar(extractAvatar(r.fields, "模块负责人")));

  const ratings = withIds(ratingItems);
  replaceCollection("ratings", ratings);
  ratings.forEach((r) => addAvatar(extractAvatar(r.fields, "成员姓名")));

  const commitments = withIds(commitmentSets.flat());
  replaceCollection("commitments", commitments);
  commitments.forEach((r) => addAvatar(extractAvatar(r.fields, "姓名")));

  // Roster entries carry their own avatarUrl when added directly via 组织
  // 架构管理 (pulled from the live Feishu directory at add-time) — merge
  // those in too, so someone who hasn't shown up in any Bitable record yet
  // still gets an avatar cached.
  for (const [openId, entry] of Object.entries(getRoster())) {
    if (entry.avatarUrl) addAvatar([openId, entry.avatarUrl]);
  }

  // Download anything not already cached (a no-op for everyone already on
  // disk — see avatarCache.ts), then prefer the local copy over the live
  // Feishu URL from here on, so normal usage never re-hits Feishu's CDN.
  await Promise.allSettled(Object.entries(avatarMap).map(([openId, url]) => cacheAvatar(openId, url)));
  const localFirst: Record<string, string> = {};
  for (const [openId, url] of Object.entries(avatarMap)) {
    localFirst[openId] = getCachedAvatarUrl(openId) ?? url;
  }
  replaceAvatars(localFirst);
}

export function startSyncLoop(): void {
  syncAll().catch((err) => console.error("[sync] initial sync failed:", err));
  setInterval(() => {
    syncAll().catch((err) => console.error("[sync] periodic sync failed:", err));
  }, SYNC_INTERVAL_MS);
}

import { config } from "../config.js";
import { searchAll, type Fields } from "./bitable.js";
import { replaceAvatars, replaceCollection, type StoredRecord } from "./store.js";

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

  replaceAvatars(avatarMap);
}

export function startSyncLoop(): void {
  syncAll().catch((err) => console.error("[sync] initial sync failed:", err));
  setInterval(() => {
    syncAll().catch((err) => console.error("[sync] periodic sync failed:", err));
  }, SYNC_INTERVAL_MS);
}

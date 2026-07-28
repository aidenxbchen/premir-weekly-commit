import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRecord, type Fields } from "./bitable.js";

// A small local cache of everything read from Bitable, so page loads never
// have to wait on (or fail because of) a live Feishu API call. Bitable stays
// the source of truth for writes — this is a read-through/write-through
// cache, refreshed on a timer (see sync.ts) plus updated immediately after
// any write this app makes, not a general-purpose database.
//
// Started as better-sqlite3, but its native build failed here (broken Xcode
// Command Line Tools install — a local machine issue, not a code issue) and
// a native dependency would also complicate the eventual Docker build for
// no real benefit at this data volume (a few hundred records total across
// every table). A flat JSON file gives the same properties — persistent,
// synchronous, survives restarts — without the native-compile risk.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../../data");
const DATA_FILE = path.join(DATA_DIR, "cache.json");

export type StoredRecord = { record_id: string; fields: Fields };

// The team roster — who's in which module, with what role — used to live
// in a static roster.json bundled with the server code, hand-edited by
// whoever was deploying. Now it's part of this same mutable store instead,
// so the org-management page can add/remove people at runtime without a
// code change or redeploy. roster.json is only ever read once, as the
// bootstrap seed for a store that doesn't have roster data yet (a brand
// new cache.json, or one from before this migration) — after that first
// load it's dead weight, kept around only as that seed.
export type Role = "admin" | "lead" | "member";
export interface RosterEntry {
  name: string;
  role: Role;
  module?: string;
  avatarUrl?: string;
}

interface State {
  collections: Record<string, StoredRecord[]>;
  avatars: Record<string, string>;
  appState: Record<string, string>;
  roster: Record<string, RosterEntry>;
}

function emptyState(): State {
  return { collections: {}, avatars: {}, appState: {}, roster: {} };
}

let state: State = emptyState();

(function load() {
  if (existsSync(DATA_FILE)) {
    try {
      const parsed = JSON.parse(readFileSync(DATA_FILE, "utf-8"));
      state = { ...emptyState(), ...parsed };
    } catch (err) {
      console.error("[store] cache.json was corrupt, starting fresh:", err);
    }
  }
  if (Object.keys(state.roster).length === 0) {
    try {
      const seedPath = path.join(__dirname, "../roster.json");
      const raw = JSON.parse(readFileSync(seedPath, "utf-8")) as Record<string, unknown>;
      const seeded: Record<string, RosterEntry> = {};
      for (const [openId, entry] of Object.entries(raw)) {
        if (openId.startsWith("_")) continue;
        seeded[openId] = entry as RosterEntry;
      }
      state.roster = seeded;
      persist();
      console.log(`[store] seeded roster from roster.json (${Object.keys(seeded).length} people)`);
    } catch (err) {
      console.error("[store] no existing roster and roster.json seed failed:", err);
    }
  }
})();

let saveTimer: NodeJS.Timeout | undefined;
function persist() {
  // Debounced so a burst of writes (e.g. a full resync) doesn't hammer disk.
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(DATA_FILE, JSON.stringify(state), "utf-8");
  }, 200);
}

export function replaceCollection(name: string, records: StoredRecord[]): void {
  state.collections[name] = records;
  persist();
}

// Bitable's update-record API response only echoes back the fields that
// were actually in the write request, not the full record — confirmed
// against the real API, not assumed (a single-field checklist update came
// back as just `{"B+达标": "✅"}`). Every write-through call site passes
// that response straight in here, so this MUST merge onto whatever's
// already cached rather than replace it wholesale, or every partial write
// would blank out every other field in the local view until the next full
// resync (up to 45s later) quietly re-fetched the real data from Bitable.
export function upsertRecord(name: string, record: StoredRecord): void {
  if (!record.record_id) return;
  const list = state.collections[name] ?? (state.collections[name] = []);
  const idx = list.findIndex((r) => r.record_id === record.record_id);
  if (idx === -1) list.push(record);
  else list[idx] = { ...list[idx], fields: { ...list[idx].fields, ...record.fields } };
  persist();
}

export function queryCollection(name: string, predicate: (r: StoredRecord) => boolean): StoredRecord[] {
  return (state.collections[name] ?? []).filter(predicate);
}

export function findRecord(name: string, recordId: string): StoredRecord | undefined {
  return (state.collections[name] ?? []).find((r) => r.record_id === recordId);
}

// Every write's "read current state first" pre-check (lock-checks,
// checklist-completeness, owner checks) used to call Bitable's single-record
// GET endpoint live — measured directly against the real API, that endpoint
// takes ~7s from this environment, versus ~1.3s for the bulk search
// endpoint the periodic sync already uses. That 7s was eaten on every
// checkbox click and every grade submission. This prefers the local cache
// (already fresh — updated by our own writes immediately, and by the
// periodic full resync at most 45s stale) and only falls back to a live
// read if the record genuinely isn't cached yet, e.g. a request landing in
// the brief window right after server startup before the first sync
// completes.
export async function findRecordCached(
  name: string,
  tableId: string,
  recordId: string
): Promise<StoredRecord | undefined> {
  const cached = findRecord(name, recordId);
  if (cached) return cached;
  const live = await getRecord(tableId, recordId);
  if (live?.record_id) {
    const record = { record_id: live.record_id, fields: live.fields };
    upsertRecord(name, record);
    return record;
  }
  return undefined;
}

export function replaceAvatars(map: Record<string, string>): void {
  state.avatars = map;
  persist();
}

export function getAvatars(): Record<string, string> {
  return state.avatars;
}

export function getAppState(key: string): string | undefined {
  return state.appState[key];
}

export function setAppState(key: string, value: string): void {
  state.appState[key] = value;
  persist();
}

export function getRoster(): Record<string, RosterEntry> {
  return state.roster;
}

export function setRosterEntry(openId: string, entry: RosterEntry): void {
  state.roster[openId] = entry;
  persist();
}

export function deleteRosterEntry(openId: string): void {
  delete state.roster[openId];
  persist();
}

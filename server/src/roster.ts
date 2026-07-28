import { deleteRosterEntry, getRoster, setRosterEntry, type Role, type RosterEntry } from "./lib/store.js";

export type { Role, RosterEntry };

export function lookupUser(openId: string): RosterEntry | undefined {
  return getRoster()[openId];
}

export function leadOpenIdOf(moduleName: string): string | undefined {
  return Object.entries(getRoster()).find(([, e]) => e.module === moduleName && e.role === "lead")?.[0];
}

export function listRoster(): Array<{ openId: string } & RosterEntry> {
  return Object.entries(getRoster()).map(([openId, entry]) => ({ openId, ...entry }));
}

export function upsertRosterEntry(openId: string, entry: RosterEntry): void {
  setRosterEntry(openId, entry);
}

export function removeRosterEntry(openId: string): void {
  deleteRosterEntry(openId);
}

import { client } from "../feishu.js";

// Feishu's contact API has no free-text "search everyone by name" endpoint
// — the closest primitives are "list a department's children" and "list a
// department's users", so a full-org search means walking the department
// tree once and filtering client-side. Requires the app to have contact
// (通讯录) read permission, which this app didn't need before this feature
// — see README for the exact scope to grant.
//
// Uses the non-`WithIterator` SDK methods with manual pagination —
// confirmed directly that the `WithIterator` variants swallow a
// permission-denied error internally (silently end iteration instead of
// throwing), while the plain methods throw normally like every other SDK
// call in this codebase. Explicit pagination here so a missing permission
// actually surfaces as an error instead of looking like "no matches".
export interface DirectoryPerson {
  openId: string;
  name: string;
  avatarUrl?: string;
}

let cache: DirectoryPerson[] = [];
let cachedAt = 0;
const TTL_MS = 5 * 60 * 1000; // org structure changes rarely; no need to refetch every search

async function fetchAllDepartmentIds(): Promise<string[]> {
  const ids = new Set<string>(["0"]);
  let pageToken: string | undefined;
  do {
    const res = await client.contact.department.children({
      path: { department_id: "0" },
      params: {
        department_id_type: "open_department_id",
        fetch_child: true,
        page_size: 50,
        page_token: pageToken,
      },
    });
    for (const dept of res.data?.items ?? []) {
      if (dept.open_department_id) ids.add(dept.open_department_id);
    }
    pageToken = res.data?.page_token;
    if (!res.data?.has_more) break;
  } while (pageToken);
  return [...ids];
}

async function fetchUsersInDepartment(
  departmentId: string,
  seen: Set<string>,
  out: DirectoryPerson[]
): Promise<void> {
  let pageToken: string | undefined;
  do {
    const res = await client.contact.user.findByDepartment({
      params: {
        department_id: departmentId,
        department_id_type: "open_department_id",
        user_id_type: "open_id",
        page_size: 50,
        page_token: pageToken,
      },
    });
    for (const u of res.data?.items ?? []) {
      if (u.open_id && !seen.has(u.open_id)) {
        seen.add(u.open_id);
        out.push({ openId: u.open_id, name: u.name, avatarUrl: u.avatar?.avatar_240 });
      }
    }
    pageToken = res.data?.page_token;
    if (!res.data?.has_more) break;
  } while (pageToken);
}

async function refreshDirectory(): Promise<void> {
  const departmentIds = await fetchAllDepartmentIds();
  const seen = new Set<string>();
  const out: DirectoryPerson[] = [];
  for (const id of departmentIds) {
    await fetchUsersInDepartment(id, seen, out);
  }
  cache = out;
  cachedAt = Date.now();
}

export async function searchDirectory(query: string): Promise<DirectoryPerson[]> {
  if (Date.now() - cachedAt > TTL_MS) {
    await refreshDirectory();
  }
  const q = query.trim().toLowerCase();
  const matches = q ? cache.filter((p) => p.name.toLowerCase().includes(q)) : cache;
  return matches.slice(0, 30);
}

import { client } from "../feishu.js";
import { config } from "../config.js";

export type FieldValue =
  | string
  | number
  | boolean
  | { text?: string; link?: string }
  | Array<{ id?: string; name?: string }>
  | Array<string>;

export type Fields = Record<string, FieldValue>;

export type SearchCondition = {
  field_name: string;
  operator: "is" | "isNot" | "contains" | "doesNotContain" | "isEmpty" | "isNotEmpty" | "in";
  value?: string[];
};

export function eq(fieldName: string, value: string): SearchCondition {
  return { field_name: fieldName, operator: "is", value: [value] };
}

export async function searchAll(
  tableId: string,
  conditions: SearchCondition[],
  fieldNames?: string[]
) {
  const items: Array<{ record_id?: string; fields: Fields }> = [];
  let pageToken: string | undefined;
  do {
    const res = await client.bitable.v1.appTableRecord.search({
      path: { app_token: config.baseToken, table_id: tableId },
      params: { page_size: 100, page_token: pageToken, user_id_type: "open_id" },
      data: {
        field_names: fieldNames,
        filter: conditions.length ? { conjunction: "and", conditions } : undefined,
      },
    });
    items.push(...((res.data?.items ?? []) as Array<{ record_id?: string; fields: Fields }>));
    pageToken = res.data?.page_token;
    if (!res.data?.has_more) break;
  } while (pageToken);
  return items;
}

export async function getRecord(tableId: string, recordId: string) {
  const res = await client.bitable.v1.appTableRecord.get({
    path: { app_token: config.baseToken, table_id: tableId, record_id: recordId },
    params: { user_id_type: "open_id" },
  });
  return res.data?.record as { record_id?: string; fields: Fields } | undefined;
}

export async function createRecord(tableId: string, fields: Fields) {
  const res = await client.bitable.v1.appTableRecord.create({
    path: { app_token: config.baseToken, table_id: tableId },
    params: { user_id_type: "open_id" },
    data: { fields },
  });
  return res.data?.record;
}

export async function updateRecord(tableId: string, recordId: string, fields: Fields) {
  const res = await client.bitable.v1.appTableRecord.update({
    path: { app_token: config.baseToken, table_id: tableId, record_id: recordId },
    params: { user_id_type: "open_id" },
    data: { fields },
  });
  return res.data?.record;
}

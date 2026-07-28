import { client } from "./feishu.js";

const SRC_APP = "NjAjb72CNameg5sHhBbcmvcan4d";

const TABLES: Record<string, string> = {
  模块周里程碑: "tblGKR74qGaXCfdW",
  示例个人周承诺: "tblXAqLIG6FBeR73",
  洗净周承诺: "tblIhR0i46uKbufp",
  烘干周承诺: "tblERKdJFZF6yoAF",
  熨烫周承诺: "tblWHqGkbLUYHaPz",
  净水周承诺: "tblLR81EjCqfuDIZ",
  软件周承诺: "tblSf6nLeT9UfWoD",
};

async function fetchAll(tableId: string) {
  const items: any[] = [];
  let pageToken: string | undefined;
  do {
    const res = await client.bitable.v1.appTableRecord.search({
      path: { app_token: SRC_APP, table_id: tableId },
      params: { page_size: 100, page_token: pageToken },
      data: {},
    });
    items.push(...(res.data?.items ?? []));
    pageToken = res.data?.page_token;
    if (!res.data?.has_more) break;
  } while (pageToken);
  return items;
}

async function main() {
  for (const [label, tableId] of Object.entries(TABLES)) {
    const fields = await client.bitable.v1.appTableField.list({
      path: { app_token: SRC_APP, table_id: tableId },
      params: { page_size: 100 },
    });
    const items = await fetchAll(tableId);
    console.log(`\n=== ${label} (${tableId}) — ${items.length} records ===`);
    console.log("fields:", (fields.data?.items ?? []).map((f) => f.field_name).join(", "));
    for (const r of items.slice(0, 3)) {
      console.log(JSON.stringify(r.fields));
    }
  }
}

main().catch((err) => console.error("ERROR:", JSON.stringify(err?.response?.data ?? err, null, 2)));

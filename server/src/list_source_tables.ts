import { client } from "./feishu.js";

const SRC_APP = "NjAjb72CNameg5sHhBbcmvcan4d";

async function main() {
  const tables = await client.bitable.v1.appTable.list({ path: { app_token: SRC_APP }, params: { page_size: 100 } });
  for (const t of tables.data?.items ?? []) {
    console.log(t.table_id, t.name);
  }
}

main().catch((err) => console.error("ERROR:", JSON.stringify(err?.response?.data ?? err, null, 2)));

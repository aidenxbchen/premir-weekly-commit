import * as lark from "@larksuiteoapi/node-sdk";
import { config } from "./config.js";

// App-identity client: calls made through this use tenant_access_token
// automatically (managed by the SDK), which is what we use for every
// Bitable read/write. The self-built app must be added as an editor
// collaborator on the target Base — see README.
export const client = new lark.Client({
  appId: config.feishu.appId,
  appSecret: config.feishu.appSecret,
  domain: lark.Domain.Feishu,
});

export const withUserAccessToken = lark.withUserAccessToken;

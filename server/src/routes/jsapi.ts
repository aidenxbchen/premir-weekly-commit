import { Router } from "express";
import { buildJsApiSignature } from "../lib/jssdk.js";
import { wrap } from "../lib/asyncHandler.js";

export const jsapiRouter = Router();

// Unauthenticated by design: the frontend needs this signature *before*
// silent login can run (Feishu JS-SDK config() must succeed first).
jsapiRouter.get(
  "/signature",
  wrap(async (req, res) => {
    const url = String(req.query.url ?? "");
    if (!url) return res.status(400).json({ error: "missing_url" });
    const sig = await buildJsApiSignature(url);
    res.json(sig);
  })
);

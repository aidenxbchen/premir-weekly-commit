import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import express, { type ErrorRequestHandler } from "express";
import { config } from "./config.js";
import { AVATAR_DIR } from "./lib/avatarCache.js";
import { startNightlyBackupSchedule } from "./lib/nightlyBackup.js";
import { startSyncLoop } from "./lib/sync.js";
import { authRouter } from "./routes/auth.js";
import { backupRouter } from "./routes/backup.js";
import { commitmentsRouter } from "./routes/commitments.js";
import { gradeRouter } from "./routes/grade.js";
import { jsapiRouter } from "./routes/jsapi.js";
import { meRouter } from "./routes/me.js";
import { milestonesRouter } from "./routes/milestones.js";
import { orgRouter } from "./routes/org.js";
import { ratingsRouter } from "./routes/ratings.js";
import { rosterRouter } from "./routes/roster.js";
import { weekRouter } from "./routes/week.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRouter);
app.use("/api/me", meRouter);
app.use("/api/milestones", milestonesRouter);
app.use("/api/commitments", commitmentsRouter);
app.use("/api/grade", gradeRouter);
app.use("/api/jsapi", jsapiRouter);
app.use("/api/ratings", ratingsRouter);
app.use("/api/roster", rosterRouter);
app.use("/api/org", orgRouter);
app.use("/api/week", weekRouter);
app.use("/api/backup", backupRouter);

// Locally-cached avatar images (see lib/avatarCache.ts) — served straight
// from disk so the browser never has to hit Feishu's CDN for a person
// whose avatar has already been downloaded once.
app.use("/avatars", express.static(AVATAR_DIR));

// Serve the built frontend (npm run build outputs it to ../web/dist).
const webDist = path.join(__dirname, "../../web/dist");
app.use(express.static(webDist));
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(path.join(webDist, "index.html"));
});

interface FeishuApiError {
  response?: { status?: number; data?: { code?: number; msg?: string } };
  status?: number;
  message?: string;
}

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  const e = err as FeishuApiError;
  const feishu = e.response?.data;
  const status = e.response?.status ?? e.status ?? 500;
  res.status(status).json({
    error: feishu?.msg ?? e.message ?? "internal_error",
    feishuCode: feishu?.code,
  });
};
app.use(errorHandler);

startSyncLoop();
startNightlyBackupSchedule();

app.listen(config.port, () => {
  console.log(`premir-weekly-commit server listening on :${config.port}`);
});

/* eslint-disable */
/** auto generated, do not edit */
import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex, uuid, varchar, customType } from "drizzle-orm/pg-core"

export const customTimestamptz = customType<{
  data: Date;
  driverData: string;
  config: { precision?: number };
}>({
  dataType(config) {
    const precision = typeof config?.precision !== 'undefined'
      ? ` (${config.precision})`
      : '';
    return `timestamptz${precision}`;
  },
  toDriver(value: Date | string | number) {
    if (value == null) return value as any;
    if (typeof value === 'number') return new Date(value).toISOString();
    if (typeof value === 'string') return value;
    if (value instanceof Date) return value.toISOString();
    throw new Error('Invalid timestamp value');
  },
  fromDriver(value: string | Date): Date {
    if (value instanceof Date) return value;
    return new Date(value);
  },
});

export const userProfile = customType<{
  data: string;
  driverData: string;
}>({
  dataType() {
    return 'user_profile';
  },
  toDriver(value: string) {
    return sql`ROW(${value})::user_profile`;
  },
  fromDriver(value: string) {
    const [userId] = value.slice(1, -1).split(',');
    return userId.trim();
  },
});

export type FileAttachment = {
  bucket_id: string;
  file_path: string;
};

export const fileAttachment = customType<{
  data: FileAttachment;
  driverData: string;
}>({
  dataType() {
    return 'file_attachment';
  },
  toDriver(value: FileAttachment) {
    return sql`ROW(${value.bucket_id},${value.file_path})::file_attachment`;
  },
  fromDriver(value: string): FileAttachment {
    const [bucketId, filePath] = value.slice(1, -1).split(',');
    return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
  },
});

export function escapeLiteral(str: string): string {
  return "'" + str.replace(/'/g, "''") + "'";
}

export const userProfileArray = customType<{
  data: string[];
  driverData: string;
}>({
  dataType() {
    return 'user_profile[]';
  },
  toDriver(value: string[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::user_profile[]`;
    }
    const elements = value.map(id => `ROW(${escapeLiteral(id)})::user_profile`).join(',');
    return sql.raw(`ARRAY[${elements}]::user_profile[]`);
  },
  fromDriver(value: string): string[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => m.slice(1, -1).split(',')[0].trim());
  },
});

export const fileAttachmentArray = customType<{
  data: FileAttachment[];
  driverData: string;
}>({
  dataType() {
    return 'file_attachment[]';
  },
  toDriver(value: FileAttachment[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::file_attachment[]`;
    }
    const elements = value.map(f =>
      `ROW(${escapeLiteral(f.bucket_id)},${escapeLiteral(f.file_path)})::file_attachment`
    ).join(',');
    return sql.raw(`ARRAY[${elements}]::file_attachment[]`);
  },
  fromDriver(value: string): FileAttachment[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => {
      const [bucketId, filePath] = m.slice(1, -1).split(',');
      return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
    });
  },
});

export const commentReceipt = pgTable("comment_receipt", {
  id: uuid("id").primaryKey().defaultRandom(),
  commentId: uuid("comment_id").notNull(),
  recipientProfile: userProfile("recipient_profile").notNull(),
  readAt: customTimestamptz("read_at", { precision: 3 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  // Complex index: CREATE UNIQUE INDEX uk_comment_receipt_recipient ON comment_receipt USING btree (comment_id, ((recipient_profile).user_id)),
  // Complex index: CREATE INDEX idx_comment_receipt_unread ON comment_receipt USING btree (((recipient_profile).user_id)) WHERE (read_at IS NULL),
]);

export const comment = pgTable("comment", {
  id: uuid("id").primaryKey().defaultRandom(),
  targetType: varchar("target_type", { length: 32 }).notNull(),
  targetId: uuid("target_id").notNull(),
  authorProfile: userProfile("author_profile").notNull(),
  authorName: text("author_name"),
  body: text("body").notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_comment_target").on(table.targetType, table.targetId, table.createdAt),
]);

export const department = pgTable("department", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  hasMilestone: boolean("has_milestone").notNull().default(true),
  ranked: boolean("ranked").notNull().default(false),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  uniqueIndex("uk_department_name").on(table.name),
]);

export const ratingChangeLog = pgTable("rating_change_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectType: varchar("subject_type", { length: 20 }).notNull(),
  subjectId: text("subject_id").notNull(),
  week: varchar("week", { length: 10 }).notNull(),
  module: varchar("module", { length: 50 }).notNull(),
  which: varchar("which", { length: 20 }).notNull(),
  previousGrade: varchar("previous_grade", { length: 5 }),
  previousNote: text("previous_note"),
  nextGrade: varchar("next_grade", { length: 5 }),
  nextNote: text("next_note"),
  reason: text("reason").notNull(),
  actorProfile: userProfile("actor_profile").notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_rating_change_log_subject").on(table.subjectType, table.subjectId, table.week),
]);

export const commitmentEditRequest = pgTable("commitment_edit_request", {
  id: uuid("id").primaryKey().defaultRandom(),
  commitmentId: uuid("commitment_id").notNull(),
  requesterProfile: userProfile("requester_profile").notNull(),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 20 }).notNull().default('pending'),
  reviewerProfile: userProfile("reviewer_profile"),
  reviewNote: text("review_note"),
  reviewedAt: customTimestamptz("reviewed_at", { precision: 3 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_commitment_edit_request_commitment").on(table.commitmentId),
  index("idx_commitment_edit_request_status").on(table.status),
]);

export const weeklyBPlus = pgTable("weekly_b_plus", {
  id: uuid("id").primaryKey().defaultRandom(),
  week: varchar("week", { length: 10 }).notNull(),
  ownerProfile: userProfile("owner_profile").notNull(),
  criteria: text("criteria"),
  name: text("name"),
  editAuthorized: boolean("edit_authorized"),
  editReason: text("edit_reason"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  // Complex index: CREATE UNIQUE INDEX uk_weekly_b_plus_week_owner ON weekly_b_plus USING btree (week, ((owner_profile).user_id)),
  index("idx_weekly_b_plus_week").on(table.week),
]);

export const moduleRating = pgTable("module_rating", {
  id: uuid("id").primaryKey().defaultRandom(),
  week: varchar("week", { length: 10 }).notNull(),
  module: varchar("module", { length: 50 }).notNull(),
  weekendGrade: varchar("weekend_grade", { length: 5 }),
  weekendNote: text("weekend_note"),
  mondayGrade: varchar("monday_grade", { length: 5 }),
  mondayNote: text("monday_note"),
  updatedAt: customTimestamptz("updated_at", { precision: 6 }).notNull().default(sql`now()`),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 6 }).notNull().default(sql`now()`),
}, (table) => [
  uniqueIndex("uk_module_rating_week_module").on(table.week, table.module),
]);

export const rosterSnapshot = pgTable("roster_snapshot", {
  id: uuid("id").primaryKey().defaultRandom(),
  throughWeek: varchar("through_week", { length: 10 }).notNull(),
  userId: text("user_id").notNull(),
  module: varchar("module", { length: 50 }),
  role: varchar("role", { length: 20 }).notNull(),
  name: text("name"),
  email: text("email"),
  level: varchar("level", { length: 10 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 6 }).notNull().default(sql`now()`),
}, (table) => [
  index("idx_roster_snapshot_through_week").on(table.throughWeek),
]);

export const ratingEmailOutbox = pgTable("rating_email_outbox", {
  eventKey: text("event_key").primaryKey(),
  ratingId: uuid("rating_id").notNull(),
  ratingWhich: varchar("rating_which", { length: 10 }).notNull(),
  recipientUserId: text("recipient_user_id").notNull(),
  recipientEmail: text("recipient_email"),
  /**
   * @type { source: string; sourceId: string; recipientUserId: string; module: string; week: string; which: "weekend" | "monday"; grade: "A" | "B+" | "B" | "C"; note: string; ratedAt: string }
   */
  eventPayload: jsonb("event_payload").notNull(),
  /**
   * @type { version: number; createdAt: string; recipientEmail: string; renderInput: Record<string, unknown>; rendered: Record<string, unknown> }
   */
  snapshot: jsonb("snapshot"),
  status: varchar("status", { length: 10 }).notNull().default('pending'),
  deliveryStatus: varchar("delivery_status", { length: 10 }),
  attempts: integer("attempts").notNull().default(0),
  nextAttempt: customTimestamptz("next_attempt", { precision: 3 }),
  claimedAt: customTimestamptz("claimed_at", { precision: 3 }),
  claimToken: text("claim_token"),
  testedAt: customTimestamptz("tested_at", { precision: 3 }),
  sentAt: customTimestamptz("sent_at", { precision: 3 }),
  failedAt: customTimestamptz("failed_at", { precision: 3 }),
  messageId: text("message_id"),
  lastError: text("last_error"),
  createdAt: customTimestamptz("created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: customTimestamptz("updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_rating_email_outbox_due").on(table.nextAttempt, table.createdAt),
  index("idx_rating_email_outbox_stale_claim").on(table.claimedAt),
]);

export const softwareCommitment = pgTable("software_commitment", {
  id: uuid("id").primaryKey().defaultRandom(),
  week: varchar("week", { length: 10 }).notNull(),
  ownerProfile: userProfile("owner_profile").notNull(),
  deliverable: text("deliverable"),
  aCriteria: text("a_criteria"),
  bCriteria: text("b_criteria"),
  bPlusCriteria: text("b_plus_criteria"),
  risk: text("risk"),
  startTime: customTimestamptz("start_time", { precision: 3 }),
  endTime: customTimestamptz("end_time", { precision: 3 }),
  grade: varchar("grade", { length: 5 }),
  note: text("note"),
  locked: boolean("locked").notNull().default(false),
  checked: varchar("checked"),
  weekendGrade: varchar("weekend_grade"),
  weekendNote: text("weekend_note"),
  mondayGrade: varchar("monday_grade"),
  mondayNote: text("monday_note"),
  editAuthorized: boolean("edit_authorized").notNull().default(false),
  name: text("name"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_software_commitment_week").on(table.week),
  // Complex index: CREATE INDEX idx_software_commitment_owner ON software_commitment USING btree (((owner_profile).user_id)),
]);

export const backupRun = pgTable("backup_run", {
  id: uuid("id").primaryKey().defaultRandom(),
  ranAt: customTimestamptz("ran_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  milestoneCount: integer("milestone_count").notNull().default(0),
  commitmentCount: integer("commitment_count").notNull().default(0),
  ratingCount: integer("rating_count").notNull().default(0),
  status: varchar("status", { length: 20 }).notNull(),
  errorMessage: text("error_message"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
});

export const appState = pgTable("app_state", {
  key: varchar("key", { length: 50 }).primaryKey(),
  value: text("value"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
});

export const rating = pgTable("rating", {
  id: uuid("id").primaryKey().defaultRandom(),
  week: varchar("week", { length: 10 }).notNull(),
  module: varchar("module", { length: 50 }).notNull(),
  memberProfile: userProfile("member_profile").notNull(),
  weekendGrade: varchar("weekend_grade", { length: 5 }),
  weekendNote: text("weekend_note"),
  mondayGrade: varchar("monday_grade", { length: 5 }),
  mondayNote: text("monday_note"),
  name: text("name"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  // Complex index: CREATE UNIQUE INDEX uk_rating_week_member ON rating USING btree (week, ((member_profile).user_id)),
]);

export const commitment = pgTable("commitment", {
  id: uuid("id").primaryKey().defaultRandom(),
  week: varchar("week", { length: 10 }).notNull(),
  module: varchar("module", { length: 50 }).notNull(),
  ownerProfile: userProfile("owner_profile").notNull(),
  deliverable: text("deliverable"),
  criteria: text("criteria"),
  risk: text("risk"),
  startTime: customTimestamptz("start_time", { precision: 3 }),
  endTime: customTimestamptz("end_time", { precision: 3 }),
  checked: varchar("checked", { length: 5 }),
  weekendGrade: varchar("weekend_grade", { length: 5 }),
  weekendNote: text("weekend_note"),
  mondayGrade: varchar("monday_grade", { length: 5 }),
  mondayNote: text("monday_note"),
  locked: boolean("locked").notNull().default(false),
  editAuthorized: boolean("edit_authorized").notNull().default(false),
  name: text("name"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_commitment_week_module").on(table.week, table.module),
  // Complex index: CREATE INDEX idx_commitment_owner ON commitment USING btree (((owner_profile).user_id)),
]);

export const milestone = pgTable("milestone", {
  id: uuid("id").primaryKey().defaultRandom(),
  week: varchar("week", { length: 10 }).notNull(),
  module: varchar("module", { length: 50 }).notNull(),
  description: text("description"),
  bCriteria: text("b_criteria"),
  bPlusCriteria: text("b_plus_criteria"),
  bCheck: text("b_check"),
  bPlusCheck: text("b_plus_check"),
  leadProfile: userProfile("lead_profile"),
  weekendGrade: varchar("weekend_grade", { length: 5 }),
  weekendNote: text("weekend_note"),
  mondayGrade: varchar("monday_grade", { length: 5 }),
  mondayNote: text("monday_note"),
  bPlusEditAuthorized: boolean("b_plus_edit_authorized"),
  bPlusEditReason: text("b_plus_edit_reason"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  uniqueIndex("uk_milestone_week_module").on(table.week, table.module),
]);

export const roster = pgTable("roster", {
  id: uuid("id").primaryKey().defaultRandom(),
  memberProfile: userProfile("member_profile").notNull(),
  module: varchar("module", { length: 50 }),
  role: varchar("role", { length: 20 }).notNull().default('member'),
  coordinatingModules: text("coordinating_modules").array(),
  isMilestoneWriter: boolean("is_milestone_writer").notNull().default(false),
  email: text("email"),
  name: text("name"),
  canGrade: boolean("can_grade").notNull().default(true),
  level: varchar("level", { length: 10 }).notNull().default('member'),
  managedModules: text("managed_modules").array(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  // Complex index: CREATE UNIQUE INDEX uk_roster_member ON roster USING btree (((member_profile).user_id)),
]);

// table aliases
export const appStateTable = appState;
export const backupRunTable = backupRun;
export const commentTable = comment;
export const commentReceiptTable = commentReceipt;
export const commitmentTable = commitment;
export const commitmentEditRequestTable = commitmentEditRequest;
export const departmentTable = department;
export const milestoneTable = milestone;
export const moduleRatingTable = moduleRating;
export const ratingTable = rating;
export const ratingChangeLogTable = ratingChangeLog;
export const ratingEmailOutboxTable = ratingEmailOutbox;
export const rosterTable = roster;
export const rosterSnapshotTable = rosterSnapshot;
export const softwareCommitmentTable = softwareCommitment;
export const weeklyBPlusTable = weeklyBPlus;

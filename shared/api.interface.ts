/* 前后端共享的类型写在这里 */

export type Grade = 'A' | 'B+' | 'B' | 'C';
export type GradeWhich = 'weekend' | 'monday';
// reader：不在组织架构名单里的人默认拥有的身份——纯浏览，没有任何编辑/勾选/
// 评分权限。不是一个需要手动分配的角色，roster 里也不会出现 reader 这个值，
// 纯粹是 resolveRole() 在平台角色（admin/lead/member）都查不到时的兜底结果。
export type TeamRole = 'admin' | 'lead' | 'member' | 'reader';
// ⏹️：无法评——依赖的前置工作还没完成，跟✅/❌一样算"已处理完"，不会卡住后续评级。
export type CheckMark = '✅' | '❌' | '⏹️';

// 组别（部门）现在是数据驱动的：具体有哪些组别由 department 表决定，L1 可以在
// 组织管理页里增删。所以 ModuleName 退化成 string——它只是"某个组别的名字"这个
// 语义标签，不再是编译期常量集合（历史上它写死在这份文件里，导致界面无法增删组别）。
export type ModuleName = string;

/** Personal Space 的两段长期文字，与周次和组织归属无关。 */
export interface PersonalVisionRecord {
  nearFuture: string;
  northStar: string;
}

export interface DepartmentRecord {
  id: string;
  name: string;
  sortOrder: number;
  // 有没有周里程碑：硬件模块有（走里程碑评级），嵌入式组没有（只有个人周承诺）。
  hasMilestone: boolean;
  // 是否参与硬件模块之间的排名比较（如全功能样机组就不参与）。
  ranked: boolean;
}

/** GET /api/departments */
export interface ListDepartmentsResponse {
  items: DepartmentRecord[];
}

/** POST /api/departments —— 只有 L1 能增删组别 */
export interface CreateDepartmentRequest {
  name: string;
  hasMilestone?: boolean;
  ranked?: boolean;
}

/** PATCH /api/departments/:id —— 重命名组别：所有引用该组别的记录会一起改名 */
export interface RenameDepartmentRequest {
  name: string;
}

// 五级身份。L1/L2/L3 都是管理员，区别在"管理半径"；L4 是组内协调人（有半径、
// 能写本部门周里程碑，但不评级）；其余都是组员。
//   L1  半径 = 全部部门（全局）
//   L2  半径 = managedModules 里显式勾选的部门清单（可跨部门，这就是"管理若干部门"）
//   L3  半径 = 自己所在的部门，且能评级（"管理自己下辖部门"）
//   L4  半径 = 自己所在的部门，但只能写里程碑内容，不能评级（"组内协调人"）
//   组员 无管理半径
// 判定规则一致：半径内、不评自己、下级不评上级。之所以要显式存 L2 的半径，
// 是因为 L1/L3/L4 的半径都能从"全局/自己的部门"推出来，只有 L2 推不出来。
export type AdminLevel = 'L1' | 'L2' | 'L3' | 'L4' | 'member';
export const ADMIN_LEVELS: AdminLevel[] = ['L1', 'L2', 'L3', 'L4', 'member'];
export const LEVEL_RANK: Record<AdminLevel, number> = { L1: 4, L2: 3, L3: 2, L4: 1, member: 0 };
export const LEVEL_LABEL: Record<AdminLevel, string> = {
  L1: 'L1 · 全局管理员',
  L2: 'L2 · 部门管理员',
  L3: 'L3 · 本部门管理员',
  L4: 'L4 · 组内协调人',
  member: '组员',
};

export interface RosterMember {
  userId: string;
  // 平台侧角色（admin/lead/member）。保留是因为它同时是妙搭授权体系的桥，
  // 但所有权限判断一律看 level，不看 role。
  role: TeamRole;
  level: AdminLevel;
  module?: ModuleName;
  name?: string;
  email?: string;
  // L2 的管理半径：显式勾选的部门清单。L1/L3/组员的半径由 level + module 推出，
  // 这里为空。
  managedModules?: ModuleName[];
  // 保留字段：组长权限被削弱为"只能写内容和自己的周承诺，不能评级"时置 false。
  canGrade?: boolean;
  // 旧的协调人字段。语义已被 L2 的 managedModules 取代，保留仅为兼容存量数据。
  coordinatingModules?: ModuleName[];
}

/** GET /api/roster */
export interface ListRosterResponse {
  items: RosterMember[];
}

/** POST /api/roster/members */
export interface AddRosterMemberRequest {
  userId: string;
  level: AdminLevel;
  module?: ModuleName;
  // L2 必填、且不能为空——L2 的半径必须显式声明，这是这个模型里唯一推不出来的半径。
  managedModules?: ModuleName[];
  // 姓名/邮箱快照：加人时前端把选中人的展示名和邮箱一并带上，让 roster.name/email
  // 永远有值——历史评级/邮件导出不能再依赖"事后用 user_id 反查姓名"。
  name?: string;
  email?: string;
}

/** PATCH /api/roster/members/:userId —— 改级别 / 部门 / L2 半径 */
export interface UpdateRosterMemberRequest {
  level?: AdminLevel;
  module?: ModuleName;
  managedModules?: ModuleName[];
}

/** PATCH /api/roster/members/:userId/coordination */
export interface SetCoordinatingModulesRequest {
  coordinatingModules: ModuleName[];
}

// 飞书文档标题：前端把要渲染的文本发来，后端抽出文档链接、批量取标题。
// 键是 "<docx|wiki>:<token>"，取不到标题的键不会出现，前端据此退回显示原始链接。
export interface ResolveDocTitlesRequest {
  texts: string[];
}
export interface ResolveDocTitlesResponse {
  titles: Record<string, string>;
}

/** GET /api/me */
export interface MeResponse {
  userId: string;
  role: TeamRole;
  // 权限判断一律看 level + module + managedModules（配合 shared/permissions 的
  // canManagePerson / canManageModule）。role 只是和妙搭授权体系对接的字段。
  level: AdminLevel;
  managedModules?: ModuleName[];
  module?: ModuleName;
  week: string;
  canGrade?: boolean;
  coordinatingModules?: ModuleName[];
}

/** GET /api/week */
export interface CurrentWeekResponse {
  week: string;
}

/** GET /api/week/active — 至少存在一项业务内容的周次，不含纯空白周 */
export interface ActiveWeeksResponse {
  weeks: string[];
}

/** POST /api/week/advance */
export interface AdvanceWeekResponse {
  week: string;
}
export interface AdvanceWeekRequest {
  expectedWeek: string;
}

export interface MilestoneRecord {
  id: string;
  week: string;
  module: ModuleName;
  description?: string;
  bCriteria?: string;
  bPlusCriteria?: string;
  bCheck?: string;
  bPlusCheck?: string;
  // L1 把 B+ 验收标准退回重做（清空勾选）时置 true，附上退回原因。
  bPlusEditAuthorized?: boolean;
  bPlusEditReason?: string;
  leadUserId?: string;
  weekendGrade?: Grade;
  weekendNote?: string;
  mondayGrade?: Grade;
  mondayNote?: string;
}

/** GET /api/milestones?week= */
export interface ListMilestonesResponse {
  items: MilestoneRecord[];
}

/** POST /api/milestones */
export interface SaveMilestoneRequest {
  week: string;
  module?: ModuleName; // admin 可指定目标模块，lead 固定为自己所在模块
  description?: string;
  bCriteria?: string;
  bPlusCriteria?: string;
  bCheck?: string;
  bPlusCheck?: string;
}

/** POST /api/milestones/:id/b-plus/reopen —— L1 把 B+ 验收退回重做，reason 至少 2 个字 */
export interface ReopenBPlusRequest {
  reason: string;
}

export interface CommitmentRecord {
  canViewRating?: boolean;
  canGradeRating?: boolean;
  id: string;
  week: string;
  module: ModuleName;
  ownerUserId: string;
  name?: string;
  deliverable?: string;
  criteria?: string;
  risk?: string;
  startTime?: string;
  endTime?: string;
  checked?: CheckMark;
  weekendGrade?: Grade;
  weekendNote?: string;
  mondayGrade?: Grade;
  mondayNote?: string;
  locked: boolean;
  editAuthorized: boolean;
  editRequest?: CommitmentEditRequestRecord;
}

export type EditRequestStatus = 'pending' | 'approved' | 'rejected' | 'consumed' | 'cancelled';
export interface CommitmentEditRequestRecord {
  id: string;
  commitmentId: string;
  requesterUserId: string;
  reason: string;
  status: EditRequestStatus;
  reviewerUserId?: string;
  reviewNote?: string;
  createdAt: string;
  reviewedAt?: string;
}

export interface CreateEditRequest {
  reason: string;
}

export interface ReviewEditRequest {
  action: 'approve' | 'reject' | 'cancel';
  note?: string;
}

/** GET /api/commitments?module=&week= , GET /api/commitments/mine?week= */
export interface ListCommitmentsResponse {
  items: CommitmentRecord[];
}

/** POST /api/commitments */
export interface CreateCommitmentRequest {
  week: string;
  deliverable: string;
  criteria: string;
  risk?: string;
  startTime?: string;
  endTime?: string;
}

/** PATCH /api/commitments/:id */
export interface UpdateCommitmentRequest {
  // 只是兼容旧调用方的提示值；服务端一律用记录自身所属的模块做权限判断，不信任它。
  module?: ModuleName;
  deliverable?: string;
  criteria?: string;
  risk?: string;
  startTime?: string;
  endTime?: string;
  check?: CheckMark;
}

export interface RatingRecord {
  id: string;
  week: string;
  module: ModuleName;
  memberUserId: string;
  name?: string;
  weekendGrade?: Grade;
  weekendNote?: string;
  mondayGrade?: Grade;
  mondayNote?: string;
}

/** GET /api/ratings?week= */
export interface ListRatingsResponse {
  items: RatingRecord[];
}

// 模块自身的周里程碑评级历史——和个人评级表（RatingRecord）解耦，不跟着"现在
// 谁是负责人"变化，也不计入全员排行榜，纯粹是这个模块自己的历史记录。
export interface ModuleRatingRecord {
  id: string;
  week: string;
  module: ModuleName;
  weekendGrade?: Grade;
  weekendNote?: string;
  mondayGrade?: Grade;
  mondayNote?: string;
}

/** GET /api/ratings/module */
export interface ListModuleRatingsResponse {
  items: ModuleRatingRecord[];
}

/** POST /api/grade/milestone/:id, POST /api/grade/commitment/:module/:id */
export interface GradeRequest {
  which: GradeWhich;
  grade: Grade;
  note?: string;
  // 已有评级再次提交时必填，作为可追溯的改评原因。
  correctionReason?: string;
}

// B+验收标准是"每人每周一份"的独立判断，不属于某一条承诺——一个人一周内可能写
// 三五条承诺，但 B+ 标准只有一条，所以单独存一张表，按 (week, 人) 唯一。
// 个人中心在"写下一条新的周承诺"下面用一个复选框控制要不要写，勾上才展开多行框。
export interface WeeklyBPlusRecord {
  id: string;
  week: string;
  ownerUserId: string;
  name?: string;
  criteria?: string;
  // 保存后即锁定；管理员（L1）可以"退回"给它本人，退回期间本人能再改，保存后重新锁定。
  // 字段名和 commitment.editAuthorized 保持一致：两处语义都是"这一次开放修改"。
  editAuthorized: boolean;
  editReason?: string;
}

/** GET /api/weekly-b-plus?week= 返回该周所有人的 B+ 标准（按人一条） */
export interface ListWeeklyBPlusResponse {
  items: WeeklyBPlusRecord[];
}

/** PUT /api/weekly-b-plus —— 按 (week, 当前用户) upsert，criteria 传空串即清除 */
export interface SaveWeeklyBPlusRequest {
  week: string;
  criteria: string;
}

/** POST /api/weekly-b-plus/reopen —— L1 退回：解锁某人该周的 B+ 标准，让他改完再存 */
export interface ReopenWeeklyBPlusRequest {
  week: string;
  ownerUserId: string;
  // 退回原因，本人会看到"为什么退回来"；至少 2 个字。
  reason: string;
}

// 评论可以挂在一份周承诺、某人本周的 B+ 验收标准、里程碑描述、B / B+ 验收标准上。
// 后三者是同一行 milestone 的三个字段，所以用不同的 type 区分同一个 id。
export type CommentTargetType =
  | 'commitment'
  | 'weekly_b_plus'
  | 'milestone_description'
  | 'milestone_b'
  | 'milestone_b_plus';

export interface CommentRecord {
  /** 评论已保存，但飞书通知未送达时的提示。 */
  notificationWarning?: string;
  id: string;
  targetType: CommentTargetType;
  targetId: string;
  authorUserId: string;
  authorName?: string;
  body: string;
  createdAt: string;
  // 只有作者本人和 L1 能删
  canDelete: boolean;
}

/** GET /api/comments?targetType=&targetId= —— 一条内容下面的全部讨论（按时间正序） */
export interface ListCommentsResponse {
  items: CommentRecord[];
}

/** POST /api/comments */
export interface CreateCommentRequest {
  targetType: CommentTargetType;
  targetId: string;
  body: string;
}

/** GET /api/comments/counts?week= —— 一次拿全本周各对象的评论条数，用于图标上的角标 */
export interface CommentCountsResponse {
  counts: Record<string, number>;
}

/** One discussion in the current user's unread inbox. */
export interface CommentDiscussion {
  targetType: CommentTargetType;
  targetId: string;
  subject: string;
  week: string;
  ownerUserId?: string;
  latestCommentId: string;
  latestAt: string;
  unreadIds: string[];
}
export interface CommentInboxResponse { items: CommentDiscussion[]; }
export interface ReadCommentsRequest { commentIds: string[]; }

export interface BackupRunRecord {
  id: string;
  ranAt: string;
  milestoneCount: number;
  commitmentCount: number;
  ratingCount: number;
  status: string;
  errorMessage?: string;
}

/** GET /api/backup/runs */
export interface ListBackupRunsResponse {
  items: BackupRunRecord[];
}

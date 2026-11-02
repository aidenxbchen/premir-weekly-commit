// 之前各处都是 `e instanceof Error ? e.message : String(e)`。这个判断在正常情况下够用，
// 但至少两种情况下会失手，把一个其实有意义的错误显示成裸的 "[object Object]"：
// 1. 妙搭应用跑在 iframe 里，个别错误对象跨 iframe/realm 传递后会丢失原型链，
//    此时它明明有 message 字段，`instanceof Error` 却判断为 false。
// 2. 平台 axios 封装对 403 会把错误"吞"成一个成功 response（見 axiosConfig.js 的
//    403 downgrade 逻辑），业务层这边最终可能拿到形如 {message, error} 的原始
//    响应体而不是 Error 实例。
// 用鸭子类型兜底取 message，实在取不到再给一句友好提示，而不是把对象直接转字符串。
function rawMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  return '操作可能未完全成功，请刷新页面确认结果';
}

// 服务端的业务异常都是 `new XxxException('some_code')` 这种裸英文码——之前直接
// 透传给用户看，等于什么都没说。这里按已知码翻译成看得懂、知道该怎么办的中文；
// 查不到的码原样展示（至少比完全静默好，也提醒我们该在这里补一条）。
const KNOWN_ERROR_MESSAGES: Record<string, string> = {
  locked: '这条记录已锁定，请填写原因申请修改',
  past_week_locked: '过去的周次不能再修改，只有当前周可以编辑',
  forbidden: '没有权限执行这个操作',
  checklist_incomplete: '还有复选框没有勾完，暂时无法评级',
  weekend_not_graded_yet: '需要先完成周末评级，才能评周一',
  already_graded: '这个阶段已经评过了，请使用“更正”并填写原因',
  missing_fields: '有必填内容还没填',
  missing_module: '缺少模块参数',
  missing_week: '缺少周次参数',
  no_module: '你还没有所属模块，无法执行此操作',
  not_found: '这条记录不存在，可能已被删除，请刷新页面',
  invalid_grade: '评级不合法',
  invalid_check: '复选框状态不合法',
  invalid_which: '评级阶段参数不合法',
  module_mismatch: '数据和实际所属模块不一致，请刷新页面重试',
  missing_owner: '缺少要处理的人',
  commitments_not_checked: '本模块本周的周承诺复选框还没有全部勾选',
  correction_reason_required: '更正评级时必须填写原因',
  edit_reason_required: '请说明需要修改的内容和原因',
  edit_request_pending: '这条承诺已有一份修改申请在等待处理',
  edit_request_resolved: '这份修改申请已处理，请刷新页面查看最新状态',
  edit_already_authorized: '这条承诺已经开放修改，请直接编辑并保存',
  manager_must_return_for_edit: '负责人不能直接代改，请退回给成员本人修改',
  rating_requires_reopen: '这周已经完成评级，请先由负责人退回修改，系统会撤回旧评级',
  week_changed_refresh: '周次已发生变化，请刷新页面后再操作',
  only_L1_can_advance_week: '只有全局管理员可以开启新的一周',
  invalid_time: '时间格式不正确',
  invalid_time_range: '结束时间不能早于开始时间',
  text_too_long: '填写内容过长，请精简后再保存',
  invalid_action: '申请处理动作无效，请刷新页面后重试',
};

export function errorMessage(e: unknown): string {
  const raw = rawMessage(e);
  return KNOWN_ERROR_MESSAGES[raw] ?? raw;
}

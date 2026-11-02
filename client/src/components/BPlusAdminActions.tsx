import { useState } from 'react';
import { useSavable } from '@/hooks/useSavable';
import { ImeTextarea } from './ImeSafeText';
import { ConfirmDialog } from './ConfirmDialog';

// B+ 验收标准的两个管理动作，只有 L1（全局管理员）能看到：
//   退回 —— 把这份标准交回负责人手里，让他改完再存（保存后重新锁定）；要写原因，
//           原因对方看得到，也是留痕；
//   删除 —— 写错了就直接清空，让他重新写。不可撤销，所以走确认弹窗。
// 两处 B+ 标准（周承诺的"每人每周一份"、里程碑的"每模块每周一份"）形态不同，但动作
// 语义完全一样，所以按钮、原因输入、确认弹窗做成一个共用组件，各自只传文案与请求。
// 交互沿用承诺那边的"退回给成员修改"：先展开输入框，再提交。
export function BPlusAdminActions({
  onReopen,
  onDelete,
  reopenTitle,
  reopenMessage,
  deleteTitle,
  deleteMessage,
  reopened,
  className,
}: {
  onReopen: (reason: string) => Promise<void>;
  onDelete: () => Promise<void>;
  reopenTitle: string;
  reopenMessage: string;
  deleteTitle: string;
  deleteMessage: string;
  // 已经退回、还没重新保存时，界面要显示"已退回，等他改"，按钮也换成"重新退回"。
  reopened?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmingReopen, setConfirmingReopen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { saving, error, run } = useSavable();

  async function submitReopen(): Promise<void> {
    const ok = await run(async () => {
      await onReopen(reason.trim());
    });
    if (ok) {
      setConfirmingReopen(false);
      setOpen(false);
      setReason('');
    }
  }

  async function submitDelete(): Promise<void> {
    const ok = await run(async () => {
      await onDelete();
    });
    if (ok) setConfirmingDelete(false);
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2 flex-wrap">
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={saving}
            className="text-xs text-primary hover:underline disabled:opacity-50"
            title="把这份标准退回去，让负责人修改"
          >
            {reopened ? '重新退回' : '退回修改'}
          </button>
        )}
        <span className="text-xs text-muted-foreground/40" aria-hidden>
          ·
        </span>
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          disabled={saving}
          className="text-xs text-destructive hover:underline disabled:opacity-50"
          title="把这份标准删掉，让负责人重新写"
        >
          删除
        </button>
        {reopened && <span className="text-xs text-amber-700">已退回，等他改完重新保存</span>}
      </div>

      {open && (
        <div className="mt-2 space-y-2">
          <ImeTextarea
            value={reason}
            onChange={setReason}
            rows={2}
            placeholder="说明需要调整的地方（对方会看到这句话）"
            className="text-xs"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={saving || reason.trim().length < 2}
              onClick={() => setConfirmingReopen(true)}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs disabled:opacity-40"
            >
              退回修改
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setReason('');
              }}
              className="text-xs text-muted-foreground"
            >
              取消
            </button>
          </div>
        </div>
      )}
      {error && <div className="text-xs text-destructive mt-1">{error}</div>}

      <ConfirmDialog
        open={confirmingReopen}
        title={reopenTitle}
        message={`${reopenMessage}\n\n退回原因：${reason.trim()}`}
        confirmLabel="确认退回"
        busy={saving}
        onConfirm={submitReopen}
        onCancel={() => setConfirmingReopen(false)}
      />
      <ConfirmDialog
        open={confirmingDelete}
        title={deleteTitle}
        message={deleteMessage}
        confirmLabel="确认删除"
        busy={saving}
        onConfirm={submitDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}

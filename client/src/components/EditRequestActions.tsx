import { useState } from 'react';
import { commitmentsApi } from '@/api';
import { ImeTextarea } from './ImeSafeText';
import { ConfirmDialog } from './ConfirmDialog';
import { errorMessage } from '@/utils/error';
import type { CommitmentRecord } from '@shared/api.interface';

export function EditRequestActions({ record, mode, onChanged, onDeleted, showDelete = true }: {
  record: CommitmentRecord;
  mode: 'owner' | 'manager';
  onChanged: (record: CommitmentRecord) => void;
  // 管理员删除这条承诺之后，调用方把这一行从列表里去掉（不整页重拉）。
  onDeleted?: (id: string) => void;
  // 调用方自己已经有删除入口时（模块周承诺页的垃圾桶按钮）传 false，避免两个删除。
  showDelete?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const request = record.editRequest;

  async function run(action: () => Promise<{ record: CommitmentRecord }>) {
    setBusy(true); setError('');
    try { const result = await action(); onChanged(result.record); setOpen(false); setReason(''); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }

  // 管理员直接删掉写错的这一条（和 B+ 验收标准的删除同一套交互：先确认再说后果）。
  async function handleDelete(): Promise<void> {
    setBusy(true); setError('');
    try {
      await commitmentsApi.deleteCommitment(record.id);
      setConfirmingDelete(false);
      onDeleted?.(record.id);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }

  const deleteButton = (
    <>
      <button
        type="button"
        onClick={() => setConfirmingDelete(true)}
        disabled={busy}
        className="text-xs text-destructive hover:underline disabled:opacity-50"
        title="删掉这条承诺，让对方重新写"
      >
        删除
      </button>
      <ConfirmDialog
        open={confirmingDelete}
        title="删除这条周承诺？"
        message={`将删除 ${record.name ?? '这位伙伴'} 在本周的这条承诺${record.deliverable ? `：\n${record.deliverable}` : ''}\n\n不可撤销。如果对方还没有其它承诺，这一周的评级也会一起清掉。`}
        confirmLabel="确认删除"
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </>
  );

  if (mode === 'owner') {
    if (record.editAuthorized || request?.status === 'approved') return <div className="mt-3 text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">修改已开放，保存后会自动重新锁定；如已有评级，将自动撤回并等待重新评级。</div>;
    if (request?.status === 'pending') return <div className="mt-3 flex items-center justify-between gap-2 text-xs bg-amber-50 text-amber-800 rounded-lg px-3 py-2"><span>修改申请等待负责人处理</span><button disabled={busy} onClick={() => run(() => commitmentsApi.reviewEditRequest(request.id, { action: 'cancel' }))} className="underline">撤回</button></div>;
    return <div className="mt-3">
      {request?.status === 'rejected' && <div className="mb-2 text-xs text-rose-700 bg-rose-50 rounded-lg px-3 py-2">本次申请未开放{request.reviewNote ? `：${request.reviewNote}` : ''}</div>}
      {!open ? <button onClick={() => setOpen(true)} className="text-xs text-primary hover:underline">内容需要调整？申请修改</button> : <div className="space-y-2"><ImeTextarea value={reason} onChange={setReason} rows={2} placeholder="说明需要修改的内容和原因" className="text-xs" /><div className="flex gap-2"><button disabled={busy || reason.trim().length < 2} onClick={() => run(() => commitmentsApi.requestEdit(record.id, { reason }))} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs disabled:opacity-40">提交申请</button><button onClick={() => setOpen(false)} className="text-xs text-muted-foreground">取消</button></div></div>}
      {error && <div className="text-xs text-destructive mt-2">{error}</div>}
    </div>;
  }

  // 管理员视角：退回/处理申请在上面，删除固定在最下面一行——每条承诺都能删掉重写。
  const deleteRow = (
    <div className="flex items-center gap-2 flex-wrap pt-1">
      {showDelete && deleteButton}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );

  if (request?.status === 'pending') return (
    <div className="mt-3 space-y-2">
      <div className="bg-amber-50 rounded-lg p-3 text-xs space-y-2">
        <div className="font-medium text-amber-900">成员申请修改</div>
        <div className="text-amber-800 whitespace-pre-wrap">{request.reason}</div>
        <div className="flex gap-2">
          <button disabled={busy} onClick={() => run(() => commitmentsApi.reviewEditRequest(request.id, { action: 'approve' }))} className="px-3 py-1 rounded-lg bg-emerald-600 text-white disabled:opacity-40">同意并开放</button>
          <button disabled={busy} onClick={() => run(() => commitmentsApi.reviewEditRequest(request.id, { action: 'reject' }))} className="px-3 py-1 rounded-lg border disabled:opacity-40">拒绝</button>
        </div>
      </div>
      {deleteRow}
    </div>
  );
  if (record.editAuthorized) return <div className="mt-3 space-y-2"><div className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">已开放一次修改，等待成员保存</div>{deleteRow}</div>;
  return <div className="mt-3 space-y-2">{!open ? <button onClick={() => setOpen(true)} className="text-xs text-primary hover:underline">退回给成员修改</button> : <div className="space-y-2"><ImeTextarea value={reason} onChange={setReason} rows={2} placeholder="说明需要调整的地方" className="text-xs" /><div className="flex gap-2"><button disabled={busy || reason.trim().length < 2} onClick={() => run(() => commitmentsApi.authorizeEdit(record.id, reason))} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs disabled:opacity-40">开放一次修改</button><button onClick={() => setOpen(false)} className="text-xs text-muted-foreground">取消</button></div></div>}{deleteRow}</div>;
}

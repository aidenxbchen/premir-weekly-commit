import { useEffect, useState, useRef, type CSSProperties } from 'react';
import { useOutletContext } from 'react-router-dom';
import { CalendarDays, Sparkles } from 'lucide-react';
import { PersonalVision } from '@/components/PersonalVision';
import { CommitmentForm } from '@/components/CommitmentForm';
import { DeliverableFieldsEditor } from '@/components/DeliverableFieldsEditor';
import { RichTextEditor } from '@/components/RichTextEditor';
import { EditRequestActions } from '@/components/EditRequestActions';
import { PersonalCommentInbox } from '@/components/PersonalCommentInbox';
import { CommentThread } from '@/components/CommentThread';
import { DocLinkText } from '@/components/DocLinkText';
import { MedalCoin, TIER_METAL } from '@/components/MedalCoin';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { LayoutContext } from '@/components/Layout';
import { commentsApi, commitmentsApi, personalVisionApi, ratingsApi, weeklyBPlusApi } from '@/api';
import { useApiCache } from '@/utils/api-cache';
import { usePersonInfo } from '@/hooks/usePersonInfo';
import { finalGrade } from '@/utils/grade-score';
import { isMondayLocal } from '@/utils/datetime';
import { promiseFields } from '@/utils/criteria';
import type { CommentCountsResponse, CommitmentRecord, PersonalVisionRecord, RatingRecord } from '@shared/api.interface';

export default function PersonalCenter() {
  const { me, week } = useOutletContext<LayoutContext>();
  const { name, avatarUrl } = usePersonInfo(me.userId);
  const [items, setItems] = useState<CommitmentRecord[]>([]);
  const [ratings, setRatings] = useState<RatingRecord[]>([]);
  const [selectedWeek, setSelectedWeek] = useState(week);
  const selectedWeekRef = useRef(selectedWeek);
  selectedWeekRef.current = selectedWeek;
  const [bPlusLoadedWeek, setBPlusLoadedWeek] = useState('');
  const [bPlusId, setBPlusId] = useState('');
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [vision, setVision] = useState<PersonalVisionRecord>();
  const [visionLoading, setVisionLoading] = useState(true);
  const [visionError, setVisionError] = useState('');
  // B+验收标准是"每人每周一份"的独立判断，不属于某一条承诺，所以它有自己的加载
  // 和保存路径，和下面的承诺列表彼此独立。
  const [bPlusEnabled, setBPlusEnabled] = useState(false);
  const [bPlusText, setBPlusText] = useState('');
  // 已落库的内容。和 bPlusText 一比就知道有没有未保存的改动——没有它的话，保存
  // 成功后界面毫无变化，看起来像"点了没反应"。
  const [bPlusSaved, setBPlusSaved] = useState('');
  // 管理员把这份标准退回来了：本人可以再改一次，保存后重新锁定。
  const [bPlusReopened, setBPlusReopened] = useState(false);
  const [bPlusReopenReason, setBPlusReopenReason] = useState('');
  const [bPlusSaving, setBPlusSaving] = useState(false);
  const [bPlusError, setBPlusError] = useState('');
  const current = selectedWeek === me.week;
  const selectedRating = ratings.find((entry) => entry.week === selectedWeek);
  const bPlusEditable = bPlusLoadedWeek === selectedWeek && (!bPlusSaved.trim() || bPlusReopened) && current && !selectedRating?.weekendGrade && !selectedRating?.mondayGrade;
  // 三种可辨识的状态：还没写内容 / 有未保存的改动 / 已落库。保存按钮的文字和
  // 禁用状态直接反映这三种状态，避免"点了保存但界面毫无变化"的错觉。
  const bPlusHasText: boolean = bPlusText.trim().length > 0;
  const bPlusDirty: boolean = bPlusText !== bPlusSaved;
  const bPlusCanSave: boolean = !bPlusSaving && bPlusHasText && bPlusDirty;
  const bPlusSaveLabel: string = bPlusSaving ? '保存中…' : !bPlusHasText ? '填写后保存' : bPlusDirty ? '保存 B+验收标准' : '已保存';
  const bPlusStateHint: string = bPlusSaving ? '正在保存…' : !bPlusHasText ? '填写内容后即可保存' : bPlusDirty ? '有未保存的修改' : bPlusReopened ? '管理员已退回，改完重新保存即可' : '已保存到本周';
  const ratedWeeks = ratings.filter((rating) => finalGrade(rating.mondayGrade, rating.weekendGrade));
  const commentCountsKey = `comment-counts:${selectedWeek}`;
  const { data: commentCountsData } = useApiCache<CommentCountsResponse>(
    commentCountsKey,
    () => commentsApi.listCommentCounts(selectedWeek),
    15_000,
  );
  const commentCount = (targetType: 'commitment' | 'weekly_b_plus', targetId: string): number =>
    targetId ? commentCountsData?.counts?.[`${targetType}:${targetId}`] ?? 0 : 0;

  async function loadCommitments(targetWeek: string) {
    setLoading(true);
    setLoadError('');
    try {
      const commitmentResult = await commitmentsApi.listCommitmentsMine(targetWeek);
      if (selectedWeekRef.current !== targetWeek) return;
      setItems(commitmentResult.items);
      setAdding(false);
    } catch (e) { setLoadError(e instanceof Error ? e.message : '承诺读取失败'); }
    finally { if (selectedWeekRef.current === targetWeek) setLoading(false); }
  }

  async function loadBPlus(targetWeek: string) {
    setBPlusLoadedWeek('');
    const { item } = await weeklyBPlusApi.listWeeklyBPlusMine(targetWeek);
    if (selectedWeekRef.current !== targetWeek) return;
    setBPlusLoadedWeek(targetWeek);
    setBPlusId(item?.id ?? '');
    setBPlusText(item?.criteria ?? '');
    setBPlusSaved(item?.criteria ?? '');
    setBPlusEnabled(Boolean(item?.criteria?.trim()));
    setBPlusReopened(item?.editAuthorized === true);
    setBPlusReopenReason(item?.editReason ?? '');
    setBPlusError('');
  }

  async function saveBPlus(nextEnabled: boolean, nextText: string) {
    const savingWeek = selectedWeek;
    setBPlusSaving(true);
    setBPlusError('');
    try {
      // 提交尚未保存的标准，或管理员已经退回的那一份；保存成功后前后端一起重新锁定。
      const { item } = await weeklyBPlusApi.saveWeeklyBPlus({
        week: savingWeek,
        criteria: nextEnabled ? nextText : '',
      });
      if (selectedWeekRef.current !== savingWeek) return;
      setBPlusId(item?.id ?? '');
      setBPlusText(item?.criteria ?? '');
      setBPlusSaved(item?.criteria ?? '');
      setBPlusEnabled(Boolean(item?.criteria?.trim()));
      setBPlusReopened(false);
      setBPlusReopenReason('');
    } catch (e) {
      setBPlusError(e instanceof Error ? e.message : 'B+验收标准保存失败');
    } finally {
      setBPlusSaving(false);
    }
  }

  async function loadRatings() {
    const ratingResult = await ratingsApi.listMyRatings();
    const ordered = [...ratingResult.items].sort((a, b) => Number(b.week.slice(1)) - Number(a.week.slice(1)));
    setRatings(ordered);
  }

  async function loadVision() {
    setVisionLoading(true);
    setVisionError('');
    try {
      const { item } = await personalVisionApi.getMine();
      setVision(item);
    } catch (error) {
      setVisionError(error instanceof Error ? error.message : '个人文字读取失败');
    } finally {
      setVisionLoading(false);
    }
  }

  async function saveVision(next: PersonalVisionRecord) {
    const { item } = await personalVisionApi.saveMine(next);
    setVision(item);
  }

  useEffect(() => { setSelectedWeek(week); }, [week]);
  useEffect(() => { loadCommitments(selectedWeek); }, [selectedWeek]);
  useEffect(() => { loadBPlus(selectedWeek).catch(() => { if (selectedWeekRef.current === selectedWeek) setBPlusError('B+标准读取失败，请刷新后重试'); }); }, [selectedWeek]);
  useEffect(() => { loadRatings(); }, [me.userId]);
  useEffect(() => { loadVision(); }, [me.userId]);

  async function patch(item: CommitmentRecord, fields: Record<string, unknown>) {
    const { record } = await commitmentsApi.updateCommitment(item.id, { module: item.module, ...fields });
    setItems((prev) => prev.map((entry) => entry.id === record.id ? record : entry));
    await loadRatings();
  }

  return (
    <div className="space-y-6">
      <PersonalVision
        name={name}
        avatarUrl={avatarUrl}
        week={selectedWeek}
        current={selectedWeek === me.week}
        item={vision}
        loading={visionLoading}
        loadError={visionError}
        onRetry={loadVision}
        onSave={saveVision}
      />
      <PersonalCommentInbox meUserId={me.userId} onSelectWeek={setSelectedWeek} />
      {loadError && <div className="text-sm text-destructive bg-red-50 border border-red-100 rounded-xl px-4 py-3">加载失败：{loadError} <button className="underline ml-2" onClick={() => loadCommitments(selectedWeek)}>重新加载</button></div>}

      <div className={`personal-history-layout ${ratedWeeks.length ? '' : 'is-single'}`}>
        <section className="glass-panel p-6 min-w-0">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div><p className="eyebrow">本周约定</p><h2 className="panel-title">我的周承诺</h2></div>
            <span className="soft-chip"><CalendarDays className="size-3.5" /> {selectedWeek}{current ? ' · 本周' : ''}</span>
          </div>
          {loading ? <p className="text-sm text-muted-foreground">正在读取承诺…</p> : (
            <div className="promise-grid">
              {items.map((item, index) => {
                const canEdit = current && (!item.locked || item.editAuthorized || isMondayLocal());
                // 所有小组共用同一套字段：交付物 / 验收标准 / 依赖与风险。
                const fields = promiseFields(item);
                return <div key={item.id} className="commitment-sheet"><div className="commitment-index-column"><div className="commitment-index">{String(index + 1).padStart(2, '0')}</div><CommentThread targetType="commitment" targetId={item.id} meUserId={me.userId} count={commentCount('commitment', item.id)} className="personal-comment-trigger" /></div><div><DeliverableFieldsEditor textFields={fields} startIso={item.startTime} endIso={item.endTime} canEdit={canEdit} onSave={(value) => patch(item, value)} />{current && item.locked && !canEdit && <EditRequestActions record={item} mode="owner" onChanged={(record) => setItems((prev) => prev.map((entry) => entry.id === record.id ? record : entry))} />}</div></div>;
              })}
              {!items.length && !adding && <div className="empty-promise promise-grid-full"><Sparkles className="size-5" /><p>{selectedWeek} 还没有写下承诺</p><span>{current ? '把最重要的结果放在这里。' : '这一周没有留下承诺记录。'}</span></div>}
              {current && (adding ? (
                <div className="promise-grid-full"><CommitmentForm week={selectedWeek} onSaved={(record) => { setItems((p) => [...p, record]); setAdding(false); }} onCancel={() => setAdding(false)} /></div>
              ) : <button className="add-promise promise-grid-full" onClick={() => setAdding(true)}>＋ 写下一条新的承诺</button>)}

              {/* B+验收标准：整周一份的独立判断，不属于任何一条承诺，所以放在承诺
                  列表下面、而不是每条承诺里面。复选框不勾就是这周没有 B+ 标准。 */}
              <div className="bplus-week promise-grid-full">
                <label className="bplus-week-head">
                  <input
                    type="checkbox"
                    className="promise-optional-toggle"
                    checked={bPlusEnabled}
                    disabled={!bPlusEditable || bPlusSaving}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setBPlusEnabled(next);
                      // 未保存前可以收起；已保存后禁用开关。
                      if (!next) setBPlusText('');
                    }}
                  />
                  <span>B+验收标准</span>
                  <span className="bplus-week-hint">（选填 · 整周一份，不属于单条承诺）</span>
                  {bPlusId && <CommentThread targetType="weekly_b_plus" targetId={bPlusId} meUserId={me.userId} count={commentCount('weekly_b_plus', bPlusId)} className="bplus-comment-trigger" />}
                </label>
                {bPlusEnabled && (
                  <div className="bplus-week-body">
                    {/* 富文本与其他工作内容一致；保存后以可点击、可排版的只读内容展示。 */}
                    <RichTextEditor
                      className="bplus-rich-editor"
                      rows={3}
                      value={bPlusText}
                      onChange={setBPlusText}
                      placeholder="这一周的 B+ 验收标准"
                      disabled={!bPlusEditable || bPlusSaving}
                    />
                    {bPlusEditable && (
                      <div className="bplus-week-actions">
                        <button
                          type="button"
                          className="bplus-week-save"
                          disabled={!bPlusCanSave}
                          onClick={() => saveBPlus(true, bPlusText)}
                        >
                          {bPlusSaveLabel}
                        </button>
                        <span className={`bplus-week-state ${bPlusDirty ? 'is-dirty' : 'is-saved'}`}>
                          {bPlusStateHint}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {/* 已落库就不再解锁，除非管理员把这份标准退回来（退回期间本人可以再改一次）。 */}
                {bPlusSaved.trim() && !bPlusReopened && <div className="text-xs text-muted-foreground mt-2">已保存并锁定</div>}
                {bPlusSaved.trim() && bPlusReopened && (
                  <div className="text-xs text-amber-700 mt-2">
                    管理员已把这份 B+验收标准退回给你，改完重新保存即可（保存后再次锁定）。
                    {bPlusReopenReason ? `退回原因：${bPlusReopenReason}` : ''}
                  </div>
                )}
                {bPlusError && <div className="text-xs text-destructive mt-1">{bPlusError}</div>}
                {current && !bPlusSaved.trim() && !bPlusEditable && <div className="text-xs text-muted-foreground mt-2">本周已评级。如需调整，先申请修改任一条承诺；负责人开放后保存承诺，旧评级会自动撤回。</div>}
              </div>
            </div>
          )}
        </section>

        {ratedWeeks.length > 0 && <section className="glass-panel rating-rail" aria-label="按评级周切换承诺">
          <div className="rating-rail-track">
            {ratedWeeks.map((rating) => {
              const ratingWeek = rating.week;
              const grade = rating ? finalGrade(rating.mondayGrade, rating.weekendGrade) : undefined;
              const active = selectedWeek === ratingWeek;
              const note = rating?.mondayNote || rating?.weekendNote;
              const metal = grade ? TIER_METAL[grade] : undefined;
              const medal = <button type="button" aria-label={`${ratingWeek} ${grade}`} className="hover:opacity-80 transition-opacity cursor-pointer" onClick={() => setSelectedWeek(ratingWeek)}><MedalCoin week={ratingWeek} grade={grade!} size={active ? 'lg' : 'sm'} active={active} /></button>;
              return <div key={ratingWeek} className={`rating-rail-item ${active ? 'is-active' : ''}`}>
                {active && note ? <Tooltip><TooltipTrigger asChild>{medal}</TooltipTrigger><TooltipContent side="top" align="end" sideOffset={17} collisionPadding={18} className="rating-colored-tooltip px-4 py-3" style={{ '--bubble-bg': metal?.core, background: metal?.core, color: '#fff' } as CSSProperties}><b className="block text-[11px] tracking-wider text-white/75">{ratingWeek} · {grade}</b><div className="rating-note mt-1.5 text-[13px] leading-relaxed text-white"><DocLinkText text={note} /></div></TooltipContent></Tooltip> : medal}
                {active && <span>{ratingWeek === me.week ? '本周' : '查看中'}</span>}
              </div>;
            })}
          </div>
        </section>}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { ArrowRight, Footprints, Pencil, Star } from 'lucide-react';
import type { PersonalVisionRecord } from '@shared/api.interface';
import { BigAvatar } from '@/components/BigAvatar';
import { RichTextEditor } from '@/components/RichTextEditor';
import { DocLinkText } from './DocLinkText';

type VisionField = keyof PersonalVisionRecord;

interface PersonalVisionProps {
  name: string;
  avatarUrl?: string;
  week: string;
  current: boolean;
  item?: PersonalVisionRecord;
  loading: boolean;
  loadError?: string;
  onRetry: () => void;
  onSave: (next: PersonalVisionRecord) => Promise<void>;
}

export function PersonalVision({ name, avatarUrl, week, current, item, loading, loadError, onRetry, onSave }: PersonalVisionProps) {
  const [editing, setEditing] = useState<VisionField | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  function startEdit(field: VisionField) {
    if (!item) return;
    setEditing(field);
    setDraft(item[field]);
    setSaveError('');
  }

  async function save() {
    if (!item || !editing || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      await onSave({ ...item, [editing]: draft });
      setEditing(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  function renderCard(field: VisionField, future: boolean) {
    const active = editing === field;
    const value = item?.[field] ?? '';
    return <article className={`personal-vision-card ${future ? 'personal-vision-future' : 'personal-vision-near'}`}>
      <div className="personal-vision-card-top">
        <div className="personal-vision-card-label">
          <span className="personal-vision-icon">{future ? <Star aria-hidden="true" /> : <Footprints aria-hidden="true" />}</span>
          <span><small>{future ? 'MY NORTH STAR' : 'THE NEXT CHAPTER'}</small><strong>{future ? '未来的我' : '两个月后的我'}</strong></span>
        </div>
        {!active && item && <button type="button" className="personal-vision-edit" onClick={() => startEdit(field)} aria-label={`编辑${future ? '未来的我' : '两个月后的我'}`}><Pencil aria-hidden="true" /><span>编辑</span></button>}
      </div>
      {active ? <div className="personal-vision-editor">
        <RichTextEditor value={draft} onChange={setDraft} rows={5} maxLength={1000} disabled={saving} aria-label={future ? '未来的我' : '两个月后的我'} placeholder={future ? '写下指引你前行的未来画面…' : '写下两个月后，你希望成为的自己…'} />
        <div className="personal-vision-editor-bottom"><span>{draft.length}/1000</span><div><button type="button" onClick={() => { setEditing(null); setSaveError(''); }} disabled={saving}>取消</button><button type="button" className="personal-vision-save" onClick={save} disabled={saving || draft.trim() === value}>{saving ? '保存中…' : '保存'}</button></div></div>
        {saveError && <p className="personal-vision-error" role="alert">{saveError}</p>}
      </div> : <div className={`personal-vision-copy ${value ? '' : 'personal-vision-empty'}`}>{loading ? '正在读取你的文字…' : value ? <DocLinkText text={value} /> : (future ? '写下指引你前行的未来画面。' : '写下两个月后，你希望成为的自己。')}</div>}
      <footer>{future ? '它不催促我，只在远方为我指明方向。' : '今天的每一步，都在让我离这个自己更近。'}</footer>
    </article>;
  }

  return (
    <section className="personal-vision" aria-labelledby="personal-vision-title">
      <div className="personal-vision-glow" aria-hidden="true" />
      <header className="personal-vision-head">
        <div className="personal-vision-person">
          <BigAvatar name={name} avatarUrl={avatarUrl} size={54} />
          <div>
            <p className="personal-vision-kicker">Personal space · My horizon</p>
            <h1 id="personal-vision-title">{name}，这是你正在成为的自己。</h1>
          </div>
        </div>
        <div className="personal-vision-week">
          <span>{week}</span>
          <small>{current ? '此刻' : '回看'}</small>
        </div>
      </header>

      <div className="personal-vision-route" aria-hidden="true">
        <span className="personal-vision-route-start" />
        <span className="personal-vision-route-line" />
        <ArrowRight />
        <Star />
      </div>

      {loadError && <div className="personal-vision-load-error" role="alert">{loadError}<button type="button" onClick={onRetry}>重试</button></div>}
      <div className="personal-vision-grid">{renderCard('nearFuture', false)}{renderCard('northStar', true)}</div>
    </section>
  );
}

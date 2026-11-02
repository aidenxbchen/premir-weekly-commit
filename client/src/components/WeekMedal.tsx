import { EmptyMedalSlot, MedalCoin, type MedalSize } from './MedalCoin';

export function WeekMedal({
  week,
  grade,
  size = 'md',
  onClick,
  active,
  title,
}: {
  week: string;
  grade?: string;
  size?: MedalSize;
  onClick?: () => void;
  active?: boolean;
  title?: string | false;
}) {
  const body = grade ? <MedalCoin grade={grade} week={week} size={size} active={active} /> : <EmptyMedalSlot size={size} week={week} />;

  if (!onClick) return body;
  return (
    <button onClick={onClick} className="hover:opacity-80 transition-opacity cursor-pointer" title={title === false ? undefined : (title ?? `跳转到 ${week}`)} type="button">
      {body}
    </button>
  );
}

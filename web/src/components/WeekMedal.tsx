import { EmptyMedalSlot, MedalCoin, type MedalSize } from "./MedalCoin";

// Thin wrapper: the week label now lives inside the tile itself (see
// MedalCoin), so this just optionally makes it clickable.
export function WeekMedal({
  week,
  grade,
  size = "md",
  onClick,
  active,
}: {
  week: string;
  grade?: string;
  size?: MedalSize;
  onClick?: () => void;
  active?: boolean;
}) {
  const body = grade ? (
    <MedalCoin grade={grade} week={week} size={size} active={active} />
  ) : (
    <EmptyMedalSlot size={size} week={week} />
  );

  if (!onClick) return body;
  return (
    <button
      onClick={onClick}
      className="hover:opacity-80 transition-opacity cursor-pointer"
      title={`跳转到 ${week}`}
      type="button"
    >
      {body}
    </button>
  );
}

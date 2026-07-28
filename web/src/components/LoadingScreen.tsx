import { useEffect, useState } from "react";
import type { RankedPerson } from "../lib/ranking";
import { Avatar } from "./Avatar";
import { RankCrown } from "./RankCrown";

const RANK_LABEL: Record<1 | 2 | 3, { gradient: string; title: string }> = {
  1: { gradient: "bg-gradient-to-br from-[#ffd76a] to-[#c98600]", title: "金角大王" },
  2: { gradient: "bg-gradient-to-br from-[#e8edf2] to-[#8a97a3]", title: "银角大王" },
  3: { gradient: "bg-gradient-to-br from-[#e3a97a] to-[#8a4b1f]", title: "铜角大王" },
};

// Podium block heights — 1st tallest/center, 2nd/3rd shorter on the sides,
// matching a physical awards podium's proportions.
const BLOCK_HEIGHT: Record<1 | 2 | 3, number> = { 1: 124, 2: 84, 3: 58 };
const PODIUM_ORDER: Array<1 | 2 | 3> = [2, 1, 3];

// A progress value that eases toward whatever `ceiling` the caller sets
// (raised as each real loading step actually completes), instead of either
// jumping in discrete chunks or running on a fixed fake timer disconnected
// from real progress. Never overshoots the ceiling, always keeps drifting
// toward it, so it reads as continuous motion no matter how fast or slow
// the real steps behind it turn out to be.
function useSmoothProgress(ceiling: number): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setValue((v) => {
        if (v >= ceiling) return v;
        const gap = ceiling - v;
        return Math.min(ceiling, v + Math.max(0.6, gap * 0.1));
      });
    }, 40);
    return () => clearInterval(id);
  }, [ceiling]);
  return value;
}

export function LoadingScreen({
  ceiling,
  label,
  topThree,
}: {
  // How far the bar is currently allowed to creep — 35 while auth is in
  // flight, 90 while roster/ratings are being fetched, 100 once both are
  // done (see App.tsx's loadPhase).
  ceiling: number;
  label: string;
  // null until the roster+ratings fetch resolves — the podium renders
  // empty placeholder slots until then rather than popping into existence,
  // so there's no layout jump partway through.
  topThree: RankedPerson[] | null;
}) {
  const progress = useSmoothProgress(ceiling);

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center px-6">
      <div
        className="text-[#c98600] text-7xl sm:text-8xl mb-10 select-none"
        style={{ fontFamily: '"XiZhiQu Ximai", cursive', textShadow: "0 3px 0 rgba(201,134,0,0.18)" }}
      >
        算你厉害！
      </div>

      <div className="flex items-end gap-6 sm:gap-10 mb-12">
        {PODIUM_ORDER.map((rank) => (
          <PodiumSlot key={rank} rank={rank} person={topThree?.[rank - 1]} />
        ))}
      </div>

      <div className="w-80 sm:w-[30rem]">
        <div className="h-4 rounded-full bg-brand-border overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-blue to-brand-sky transition-[width] duration-150 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-3 text-center text-base text-brand-label">{label}</div>
      </div>
    </div>
  );
}

function PodiumSlot({ rank, person }: { rank: 1 | 2 | 3; person?: RankedPerson }) {
  const label = RANK_LABEL[rank];
  const avatarSize = rank === 1 ? 92 : 72;
  return (
    <div className="flex flex-col items-center">
      <div className="relative mb-3">
        {person ? (
          <Avatar name={person.person.name} avatarUrl={person.avatarUrl} size={avatarSize} />
        ) : (
          <div className="rounded-full bg-brand-border animate-pulse" style={{ width: avatarSize, height: avatarSize }} />
        )}
        <span className="absolute -top-4 -left-4">
          <RankCrown rank={rank} size={rank === 1 ? 42 : 32} />
        </span>
      </div>
      <div
        className={`rounded-xl px-3.5 py-2 text-center leading-tight shadow-sm mb-3 ${label.gradient} ${
          person ? "opacity-100" : "opacity-40"
        }`}
      >
        <div className="text-white text-sm font-bold whitespace-nowrap">{label.title}</div>
      </div>
      <div
        className="w-24 sm:w-32 rounded-t-md bg-gradient-to-b from-brand-pale to-brand-border flex items-start justify-center pt-2"
        style={{ height: BLOCK_HEIGHT[rank] }}
      >
        <span className="text-brand-navy/50 font-bold text-3xl">{rank}</span>
      </div>
    </div>
  );
}

import { useId } from 'react';

const RANK_METAL: Record<1 | 2 | 3, { stops: Array<[string, string]>; border: string }> = {
  1: {
    stops: [
      ['0%', '#fff6d8'],
      ['45%', '#ffd700'],
      ['100%', '#a97400'],
    ],
    border: '#a97400',
  },
  2: {
    stops: [
      ['0%', '#ffffff'],
      ['45%', '#c7d2db'],
      ['100%', '#7c8894'],
    ],
    border: '#7c8894',
  },
  3: {
    stops: [
      ['0%', '#f0c199'],
      ['45%', '#cd7f32'],
      ['100%', '#5e3512'],
    ],
    border: '#5e3512',
  },
};

export const RANK_BORDER_COLOR: Record<1 | 2 | 3, string> = {
  1: RANK_METAL[1].border,
  2: RANK_METAL[2].border,
  3: RANK_METAL[3].border,
};

// tilt 默认 true：加载页把皇冠当作斜插的装饰用。排行榜里要正着摆在名次上方，
// 传 tilt={false} 关掉。
export function RankCrown({ rank, size = 22, tilt = true }: { rank: 1 | 2 | 3; size?: number; tilt?: boolean }) {
  const uid = useId();
  const gradientId = `crown-grad-${rank}-${uid}`;
  const metal = RANK_METAL[rank];

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="drop-shadow-md" style={tilt ? { transform: 'rotate(-45deg)' } : undefined} aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          {metal.stops.map(([offset, color]: [string, string]) => (
            <stop key={offset} offset={offset} stopColor={color} />
          ))}
        </linearGradient>
      </defs>
      <path
        d="M3 18 L3 9 L7.5 13 L12 4 L16.5 13 L21 9 L21 18 Z"
        fill={`url(#${gradientId})`}
        stroke={metal.border}
        strokeWidth={0.75}
        strokeLinejoin="round"
      />
    </svg>
  );
}

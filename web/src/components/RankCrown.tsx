import { useId } from "react";

const RANK_METAL: Record<1 | 2 | 3, { stops: Array<[string, string]>; border: string }> = {
  1: {
    stops: [
      ["0%", "#fff6d8"],
      ["45%", "#ffd700"],
      ["100%", "#a97400"],
    ],
    border: "#a97400",
  },
  2: {
    stops: [
      ["0%", "#ffffff"],
      ["45%", "#c7d2db"],
      ["100%", "#7c8894"],
    ],
    border: "#7c8894",
  },
  3: {
    stops: [
      ["0%", "#f0c199"],
      ["45%", "#cd7f32"],
      ["100%", "#5e3512"],
    ],
    border: "#5e3512",
  },
};

// Card border color per rank — exported so RatingCard can pick up the same
// gold/silver/bronze without redefining the hex values.
export const RANK_BORDER_COLOR: Record<1 | 2 | 3, string> = {
  1: RANK_METAL[1].border,
  2: RANK_METAL[2].border,
  3: RANK_METAL[3].border,
};

// Gold/silver/bronze crown pinned at the top-1/2/3 person's avatar corner,
// tilted counterclockwise for a jauntier look.
export function RankCrown({ rank, size = 22 }: { rank: 1 | 2 | 3; size?: number }) {
  const uid = useId();
  const gradientId = `crown-grad-${rank}-${uid}`;
  const metal = RANK_METAL[rank];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="drop-shadow-md"
      style={{ transform: "rotate(-45deg)" }}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          {metal.stops.map(([offset, color]) => (
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

// Faithful port of the user-provided reference design (weekly-badges.html,
// current white/light-theme version): a soft white glass tile with a
// pale colored tint, a subtle halo glow, a diagonal shine, and a
// core-hued gradient letter (light -> core -> dark "ink", top to bottom).
// This replaced an earlier dark-theme version of the same reference file —
// the file itself changed, so this is a full re-port, not a tweak. Colors
// are the reference's own --core/--light/--halo/--edge/--ink/--surface
// values verbatim; --border/--weekColor/--gradeTop are that file's
// color-mix() results, precomputed here since inline styles shouldn't
// depend on color-mix() browser support.
export const TIER_METAL: Record<
  string,
  {
    core: string;
    light: string;
    halo: string;
    edge: string;
    ink: string;
    surface: string;
    surfaceDeep: string;
    border: string;
    weekColor: string;
    gradeTop: string;
  }
> = {
  A: {
    core: "#6154d8",
    light: "#a99fff",
    halo: "rgba(97,84,216,.14)",
    edge: "#c3bdf0",
    ink: "#3f2d9b",
    surface: "#f2f0ff",
    surfaceDeep: "#eae6ff",
    border: "#d0d0ec",
    weekColor: "#3f3091",
    gradeTop: "#7569e3",
  },
  "B+": {
    core: "#247cb5",
    light: "#78bce5",
    halo: "rgba(36,124,181,.11)",
    edge: "#add0e5",
    ink: "#18516b",
    surface: "#eef7fb",
    surfaceDeep: "#e1f0f7",
    border: "#c6d9e7",
    weekColor: "#1d4f68",
    gradeTop: "#3c8ec2",
  },
  B: {
    core: "#63869c",
    light: "#a2b9c8",
    halo: "rgba(99,134,156,.08)",
    edge: "#c6d5de",
    ink: "#3d6272",
    surface: "#f2f6f8",
    surfaceDeep: "#e6eef2",
    border: "#d2dbe3",
    weekColor: "#3d5e6e",
    gradeTop: "#7594a8",
  },
  C: {
    core: "#d83a32",
    light: "#ff776d",
    halo: "rgba(216,58,50,.16)",
    edge: "#e86155",
    ink: "#a8241a",
    surface: "#fff0ee",
    surfaceDeep: "#ffe0dc",
    border: "#e2a6a4",
    weekColor: "#992922",
    gradeTop: "#e34b43",
  },
};

export const MEDAL_SIZE_PX = { sm: 34, md: 42, lg: 54 };
const SIZE_PX = MEDAL_SIZE_PX;

export type MedalSize = "sm" | "md" | "lg";

export function MedalCoin({
  grade,
  week,
  size = "md",
  active = true,
}: {
  grade: string;
  week?: string;
  size?: MedalSize;
  active?: boolean;
}) {
  const metal = TIER_METAL[grade];
  const px = SIZE_PX[size];
  if (!metal) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-lg bg-gray-100 text-gray-500 shrink-0"
        style={{ width: px, height: px, fontSize: px * 0.4 }}
      >
        {grade}
      </span>
    );
  }

  const inset = Math.max(2, Math.round(px * 0.029));
  const gradeFontPx = px * (grade === "B+" ? 0.287 : 0.345);

  return (
    <span
      className="relative inline-flex shrink-0"
      style={{ width: px, height: px, opacity: active ? 1 : 0.82 }}
    >
      {/* ambient halo glow, bleeding out past the tile's own edges */}
      <span
        aria-hidden
        className="absolute rounded-full pointer-events-none"
        style={{
          inset: -px * 0.14,
          background: `radial-gradient(circle, ${metal.halo} 0%, transparent 70%)`,
          filter: `blur(${Math.max(3, Math.round(px * 0.1))}px)`,
        }}
      />
      <span
        className="relative flex flex-col items-center justify-center w-full h-full overflow-hidden"
        style={{
          borderRadius: "30%",
          border: `1px solid ${metal.border}`,
          background: [
            "radial-gradient(110% 76% at 16% -4%, rgba(255,255,255,.98) 0 38%, transparent 64%)",
            `radial-gradient(92% 72% at 82% 108%, ${metal.core}17, transparent 66%)`,
            `linear-gradient(145deg, #ffffff 0%, ${metal.surface} 48%, ${metal.surfaceDeep} 100%)`,
          ].join(", "),
          boxShadow: [
            "0 1px 2px rgba(20,28,42,.05)",
            "0 4px 10px rgba(20,28,42,.07)",
            `0 0 ${Math.max(5, Math.round(px * 0.2))}px ${metal.halo}`,
            "inset 0 1px 0 rgba(255,255,255,.95)",
          ].join(", "),
        }}
      >
        {/* inset ring */}
        <span
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            inset,
            border: "1px solid rgba(255,255,255,.9)",
            borderRadius: "26%",
            boxShadow: `0 0 0 0.6px ${metal.edge}4d, inset 0 0 8px rgba(255,255,255,.6)`,
          }}
        />
        {/* diagonal shine sweep */}
        <span
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            top: "-28%",
            left: "-34%",
            width: "98%",
            height: "76%",
            background: "linear-gradient(115deg, transparent 25%, rgba(255,255,255,.75) 49%, transparent 70%)",
            filter: "blur(2px)",
            transform: "rotate(-10deg)",
            opacity: 0.56,
          }}
        />

        {week && (
          <>
            <span
              className="relative"
              style={{
                fontSize: Math.max(7, px * 0.043),
                fontWeight: 650,
                letterSpacing: "0.18em",
                textIndent: "0.18em",
                color: metal.weekColor,
              }}
            >
              {week}
            </span>
            <span
              className="relative"
              style={{
                width: "38%",
                height: 1,
                margin: `${Math.round(px * 0.07)}px 0 ${Math.round(px * 0.055)}px`,
                background: `linear-gradient(90deg, transparent, ${metal.edge}, transparent)`,
                opacity: 0.52,
              }}
            />
          </>
        )}
        <strong
          className="relative font-semibold"
          style={{
            fontSize: gradeFontPx,
            lineHeight: 0.86,
            letterSpacing: "-0.035em",
            backgroundImage: `linear-gradient(180deg, ${metal.gradeTop} 0%, ${metal.core} 46%, ${metal.ink} 100%)`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            filter: `drop-shadow(0 ${Math.round(px * 0.03)}px ${Math.round(px * 0.06)}px ${metal.halo})`,
          }}
        >
          {grade}
        </strong>
      </span>
    </span>
  );
}

export function EmptyMedalSlot({ size = "sm", week }: { size?: MedalSize; week?: string }) {
  const px = SIZE_PX[size];
  return (
    <span
      className="relative inline-flex flex-col items-center justify-center shrink-0"
      style={{
        width: px,
        height: px,
        borderRadius: "30%",
        border: "1px dashed #d5d8de",
        background: "#f7f8fa",
      }}
    >
      {week && (
        <span
          className="text-brand-label"
          style={{ fontSize: Math.max(7, px * 0.04), fontWeight: 650, letterSpacing: "0.14em" }}
        >
          {week}
        </span>
      )}
      <span className="text-brand-label" style={{ fontSize: px * 0.2 }}>
        ·
      </span>
    </span>
  );
}

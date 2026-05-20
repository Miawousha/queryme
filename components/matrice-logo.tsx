type MatriceLogoProps = {
  size?: number;
  animated?: boolean;
};

const CELLS: { opacity: number; accent: boolean }[][] = [
  [
    { opacity: 0.9, accent: false },
    { opacity: 0.5, accent: false },
    { opacity: 0.7, accent: false },
  ],
  [
    { opacity: 0.4, accent: false },
    { opacity: 1.0, accent: true },
    { opacity: 0.6, accent: false },
  ],
  [
    { opacity: 1.0, accent: true },
    { opacity: 0.5, accent: false },
    { opacity: 1.0, accent: true },
  ],
];

export function MatriceLogo({ size = 40, animated = false }: MatriceLogoProps) {
  const gap = size * 0.08;
  const cell = (size - gap * 4) / 3;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      {CELLS.map((row, ri) =>
        row.map((c, ci) => {
          const x = gap + ci * (cell + gap);
          const y = gap + ri * (cell + gap);
          return (
            <rect
              key={`${ri}-${ci}`}
              x={x}
              y={y}
              width={cell}
              height={cell}
              rx={cell * 0.18}
              fill={c.accent ? "var(--color-accent)" : "var(--color-primary)"}
              opacity={c.opacity}
              style={
                animated
                  ? {
                      animation: `matPulse ${2 + ri * 0.3 + ci * 0.2}s ease-in-out infinite`,
                      animationDelay: `${ri * 0.15 + ci * 0.1}s`,
                    }
                  : undefined
              }
            />
          );
        }),
      )}
    </svg>
  );
}

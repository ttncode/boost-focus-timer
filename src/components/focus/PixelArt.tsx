import type { ReactNode } from "react";
import { metaOf, type AnimationType } from "./animations";

type Pixel = readonly [x: number, y: number, width: number, height: number, color: string];

const GRID = 32;
const FLICKER_CLASS = "pixel-art-flicker";
const FLICKER_CSS = `
.${FLICKER_CLASS} { animation: ${FLICKER_CLASS} 0.24s steps(1) infinite; }
@keyframes ${FLICKER_CLASS} { 50% { transform: translateY(1px); opacity: 0.75; } }
@media (prefers-reduced-motion: reduce) { .${FLICKER_CLASS} { animation: none; } }
`;

const GLASS = "#cbd5e1";
const COFFEE = "#6b3e26";
const CREMA = "#c08552";
const STEAM = "#64748b";
const CUP_ROWS = 16;

function coffeeCup(step: number): Pixel[] {
  const level = Math.min(CUP_ROWS, step);
  const coffee: Pixel[] =
    level > 0
      ? [
          [9, 27 - level, 13, level, COFFEE],
          [9, 27 - level, 13, 1, CREMA],
        ]
      : [];
  const steam: Pixel[] =
    level >= CUP_ROWS - 4
      ? [
          [12, 7, 1, 1, STEAM],
          [13, 6, 1, 1, STEAM],
          [12, 5, 1, 1, STEAM],
          [17, 8, 1, 1, STEAM],
          [18, 7, 1, 1, STEAM],
          [17, 6, 1, 1, STEAM],
        ]
      : [];
  return [
    ...steam,
    ...coffee,
    [8, 10, 1, 17, GLASS],
    [22, 10, 1, 17, GLASS],
    [8, 27, 15, 1, GLASS],
    [10, 12, 1, 5, "#f8fafc"],
    [23, 13, 3, 1, GLASS],
    [25, 14, 1, 7, GLASS],
    [23, 21, 3, 1, GLASS],
    [5, 28, 22, 1, "#e2e8f0"],
    [7, 29, 18, 1, "#94a3b8"],
  ];
}

const CELLS = 5;
const SHELL = "#e5e7eb";
const EMPTY_CELL = "#1f2937";

const chargeColor = (charged: number) => (charged <= 1 ? "#ef4444" : charged === 2 ? "#f59e0b" : "#22c55e");

function battery(step: number): Pixel[] {
  const charged = Math.min(CELLS, step);
  const cells = Array.from({ length: CELLS }, (_, index): Pixel => [
    12,
    24 - index * 4,
    8,
    3,
    index < charged ? chargeColor(charged) : EMPTY_CELL,
  ]);
  const bolt: Pixel[] =
    charged === CELLS
      ? [
          [25, 12, 2, 1, "#facc15"],
          [24, 13, 2, 1, "#facc15"],
          [24, 14, 3, 1, "#facc15"],
          [25, 15, 2, 1, "#facc15"],
          [25, 16, 1, 1, "#facc15"],
        ]
      : [];
  return [
    [13, 4, 6, 2, SHELL],
    [10, 6, 12, 1, SHELL],
    [10, 28, 12, 1, SHELL],
    [10, 6, 1, 23, SHELL],
    [21, 6, 1, 23, SHELL],
    ...cells,
    ...bolt,
  ];
}

const HULL = "#e5e7eb";
const TRIM = "#ef4444";
const ROCKET_REST_TOP = 17;
const ROCKET_MAX_LIFT = 15;
const STARS: readonly Pixel[] = [
  [3, 4, 1, 1, "#475569"],
  [27, 2, 1, 1, "#475569"],
  [24, 9, 1, 1, "#334155"],
  [6, 13, 1, 1, "#334155"],
  [28, 18, 1, 1, "#475569"],
];

function rocketBody(top: number): Pixel[] {
  return [
    [15, top, 2, 1, TRIM],
    [14, top + 1, 4, 1, TRIM],
    [13, top + 2, 6, 1, TRIM],
    [13, top + 3, 6, 8, HULL],
    [15, top + 5, 2, 2, "#38bdf8"],
    [11, top + 8, 2, 3, TRIM],
    [19, top + 8, 2, 3, TRIM],
    [14, top + 11, 4, 1, "#6b7280"],
  ];
}

const flame = (top: number): Pixel[] => [
  [14, top + 12, 4, 2, "#f97316"],
  [15, top + 12, 2, 1, "#fde047"],
  [15, top + 14, 2, 1, "#f97316"],
];

const smoke = (puff: number): Pixel[] => [
  [11 - puff, 29, 3, 1, "#6b7280"],
  [18 + puff, 29, 3, 1, "#6b7280"],
];

function rocket(step: number, frames: number): { pixels: Pixel[]; flame: Pixel[] } {
  const lift = Math.round((step / (frames - 1)) * ROCKET_MAX_LIFT);
  const top = ROCKET_REST_TOP - lift;
  const pad: Pixel[] = [[8, 30, 16, 1, "#4b5563"]];
  const isLaunching = step > 0;
  return {
    pixels: [...STARS, ...pad, ...(isLaunching && lift < 6 ? smoke(lift) : []), ...rocketBody(top)],
    flame: isLaunching ? flame(top) : [],
  };
}

function scene(type: AnimationType, step: number, frames: number): { pixels: Pixel[]; flame: Pixel[] } {
  if (type === "coffee-cup") return { pixels: coffeeCup(step), flame: [] };
  if (type === "battery") return { pixels: battery(step), flame: [] };
  return rocket(step, frames);
}

const toRects = (pixels: readonly Pixel[]): ReactNode[] =>
  pixels.map(([x, y, width, height, color], index) => (
    <rect key={index} x={x} y={y} width={width} height={height} fill={color} />
  ));

/** Draws `frame` (1-based) of a pixel-art animation on a 32×32 grid. */
export function PixelArt({ type, frame, className, label }: { type: AnimationType; frame: number; className: string; label: string }) {
  const { frames } = metaOf(type);
  const { pixels, flame: flamePixels } = scene(type, Math.min(frames, Math.max(1, frame)) - 1, frames);
  return (
    <svg viewBox={`0 0 ${GRID} ${GRID}`} shapeRendering="crispEdges" className={className} role="img" aria-label={label}>
      {flamePixels.length > 0 ? (
        <>
          <style>{FLICKER_CSS}</style>
          <g className={FLICKER_CLASS}>{toRects(flamePixels)}</g>
        </>
      ) : null}
      {toRects(pixels)}
    </svg>
  );
}

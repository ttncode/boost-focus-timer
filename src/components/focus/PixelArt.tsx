import { useEffect, type ReactNode } from "react";
import { BATTERY_LEVELS, metaOf, type AnimationType } from "./animations";

type Pixel = readonly [x: number, y: number, width: number, height: number, color: string];

const GRID = 32;
const FLICKER_CLASS = "pixel-art-flicker";
const FLICKER_CSS = `
.${FLICKER_CLASS} { animation: ${FLICKER_CLASS} 0.24s steps(1) infinite; }
@keyframes ${FLICKER_CLASS} { 50% { transform: translateY(1px); opacity: 0.75; } }
@media (prefers-reduced-motion: reduce) { .${FLICKER_CLASS} { animation: none; } }
`;

const SHELL = "#e5e7eb";
const CHARGE_LEFT = 12;
const CHARGE_WIDTH = 8;
const CHARGE_BOTTOM = 26;
const SEGMENT_ROWS = 4;
const SEGMENT_GAP = "#111827";

const chargeColor = (fraction: number) => (fraction > 0.6 ? "#22c55e" : fraction > 0.3 ? "#f59e0b" : "#ef4444");

/** Drains one row per frame: frame 1 is fully charged, the last frame is empty. */
function battery(step: number): Pixel[] {
  const level = Math.max(0, BATTERY_LEVELS - step);
  const color = chargeColor(level / BATTERY_LEVELS);
  const charge: Pixel[] = level > 0 ? [[CHARGE_LEFT, CHARGE_BOTTOM - level + 1, CHARGE_WIDTH, level, color]] : [];
  // Thin gaps split the charge into the familiar battery segments.
  const gaps = Array.from({ length: Math.floor(BATTERY_LEVELS / SEGMENT_ROWS) }, (_, index): Pixel => [
    CHARGE_LEFT,
    CHARGE_BOTTOM - (index + 1) * SEGMENT_ROWS + 1,
    CHARGE_WIDTH,
    1,
    SEGMENT_GAP,
  ]).filter(([, y]) => y > CHARGE_BOTTOM - level);
  const bolt: Pixel[] =
    level === BATTERY_LEVELS
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
    ...charge,
    ...gaps,
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

function scene(type: Exclude<AnimationType, "coffee-cup">, step: number, frames: number): { pixels: Pixel[]; flame: Pixel[] } {
  if (type === "battery") return { pixels: battery(step), flame: [] };
  return rocket(step, frames);
}

const toRects = (pixels: readonly Pixel[]): ReactNode[] =>
  pixels.map(([x, y, width, height, color], index) => (
    <rect key={index} x={x} y={y} width={width} height={height} fill={color} />
  ));

const coffeeFrameUrl = (frame: number) => `/animations/coffee-cup/${String(frame).padStart(2, "0")}.png`;

let coffeeFramesRequested = false;

/** Fetches every frame once up front so the first pass through the animation never blinks. */
function preloadCoffeeFrames(frames: number): void {
  if (coffeeFramesRequested) return;
  coffeeFramesRequested = true;
  for (let frame = 1; frame <= frames; frame++) new Image().src = coffeeFrameUrl(frame);
}

/** Draws `frame` (1-based) of a pixel-art animation on a 32×32 grid. */
export function PixelArt({ type, frame, className, label }: { type: AnimationType; frame: number; className: string; label: string }) {
  const { frames } = metaOf(type);
  const clamped = Math.min(frames, Math.max(1, frame));
  useEffect(() => {
    if (type === "coffee-cup") preloadCoffeeFrames(frames);
  }, [type, frames]);
  if (type === "coffee-cup") {
    // eslint-disable-next-line @next/next/no-img-element -- frame-by-frame animation; next/image would re-optimize every frame
    return <img src={coffeeFrameUrl(clamped)} alt={label} className={`${className} object-contain`} draggable={false} />;
  }
  const { pixels, flame: flamePixels } = scene(type, clamped - 1, frames);
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

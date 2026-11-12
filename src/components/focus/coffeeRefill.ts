/*
 * The fizzing refill drawn over the coffee-cup frames when the cup jumps to a fuller level.
 * Coordinates are in the frames' own 576×576 pixels; the liquid shape comes from the full and empty frames.
 */

export const REFILL_MS = 2600;
const SETTLE_MS = 700;
const HANDOFF_MS = 350;

const SIZE = 576;
const LEFT = 36;
const RIGHT = 448;
const TOP_FULL = 90;
const BOTTOM = 538;
const BUBBLES_PER_SECOND = 110;
const MAX_RESTING = 70;

interface Bubble {
  x: number;
  y: number;
  r: number;
  r0: number;
  vy: number;
  age: number;
  wobble: number;
  resting: boolean;
  life: number;
  drift: number;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  age: number;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (t: number) => t * t * (3 - 2 * t);
const levelY = (fill: number) => BOTTOM - (BOTTOM - TOP_FULL) * fill;

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });

let maskPromise: Promise<HTMLCanvasElement> | null = null;

/** Pixels that differ between the full and empty frames are where coffee can be. */
function liquidMask(fullSrc: string, emptySrc: string): Promise<HTMLCanvasElement> {
  maskPromise ??= Promise.all([loadImage(fullSrc), loadImage(emptySrc)]).then(([full, empty]) => {
    const pixels = (image: HTMLImageElement) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = SIZE;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, SIZE, SIZE).data;
    };
    const a = pixels(full);
    const b = pixels(empty);
    const mask = new ImageData(SIZE, SIZE);
    for (let i = 0; i < a.length; i += 4) {
      const diff = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) + Math.abs(a[i + 3] - b[i + 3]);
      if (diff > 40) mask.data[i + 3] = 255;
    }
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    canvas.getContext("2d")!.putImageData(mask, 0, 0);
    return canvas;
  });
  maskPromise.catch(() => (maskPromise = null));
  return maskPromise;
}

function drawBubble(context: CanvasRenderingContext2D, bubble: Bubble): void {
  const { r } = bubble;
  // Large bubbles flex as they rise; resting ones flatten into small domes.
  const squash = bubble.resting ? 0.82 : r > 5 ? 1 + Math.sin(bubble.age * 14 + bubble.wobble) * 0.08 : 1;
  context.save();
  context.translate(bubble.x, bubble.y);
  context.scale(1 / squash, squash);
  const body = context.createRadialGradient(-r * 0.2, -r * 0.25, r * 0.1, 0, 0, r);
  body.addColorStop(0, "rgba(255,236,214,.04)");
  body.addColorStop(0.7, "rgba(255,232,206,.14)");
  body.addColorStop(1, "rgba(255,240,224,.5)");
  context.beginPath();
  context.arc(0, 0, r, 0, Math.PI * 2);
  context.fillStyle = body;
  context.fill();
  context.lineWidth = Math.max(0.8, r * 0.12);
  context.strokeStyle = bubble.resting ? "rgba(255,246,236,.75)" : "rgba(255,246,236,.55)";
  context.stroke();
  context.beginPath();
  context.ellipse(-r * 0.38, -r * 0.4, r * 0.26, r * 0.17, -0.6, 0, Math.PI * 2);
  context.fillStyle = "rgba(255,255,255,.92)";
  context.fill();
  context.restore();
}

/**
 * Animates the cup from `from` to `to` (fill fractions, 0 = empty) on `canvas`, which sits over the empty-cup frame.
 * Ends by fading in `toSrc` so the hand-back to the plain frame is seamless. Returns a cancel function.
 */
export function playRefill(
  canvas: HTMLCanvasElement,
  { from, to, fullSrc, emptySrc, toSrc, onDone }: { from: number; to: number; fullSrc: string; emptySrc: string; toSrc: string; onDone: () => void },
): () => void {
  let cancelled = false;
  let frameId = 0;
  const context = canvas.getContext("2d");
  const layer = document.createElement("canvas");
  layer.width = layer.height = canvas.width = canvas.height = SIZE;
  const liquid = layer.getContext("2d");
  if (!context || !liquid) {
    onDone();
    return () => {};
  }

  const bubbles: Bubble[] = [];
  const rings: Ring[] = [];
  let fill = from;
  let elapsed = 0;

  const wave = (x: number) => {
    const amplitude = 7 * (elapsed < REFILL_MS ? 1 : Math.exp(-((elapsed - REFILL_MS) / 1000) * 4));
    const t = elapsed / 1000;
    return amplitude * Math.min(1, fill * 5) * (Math.sin(x * 0.028 + t * 7) * 0.6 + Math.sin(x * 0.07 - t * 10) * 0.4);
  };
  const surface = (x: number) => levelY(fill) + wave(x);

  const pop = (bubble: Bubble, top: number) => {
    bubble.life = -1;
    rings.push({ x: bubble.x, y: top, r: bubble.r, age: 0 });
  };

  function update(dt: number) {
    elapsed += dt * 1000;
    fill = from + (to - from) * smooth(clamp01(elapsed / REFILL_MS));
    if (elapsed < REFILL_MS) {
      for (let n = BUBBLES_PER_SECOND * dt; n > 0 && (n >= 1 || Math.random() < n); n--) {
        const r = rand(1.6, 5.5);
        bubbles.push({ x: rand(LEFT + 30, RIGHT - 30), y: Math.max(levelY(fill) + 12, BOTTOM - rand(20, 60)), r, r0: r, vy: -rand(200, 420), age: 0, wobble: rand(0, 6), resting: false, life: 0, drift: 0 });
      }
    }
    let resting = 0;
    for (const bubble of bubbles) {
      bubble.age += dt;
      const top = surface(bubble.x);
      if (bubble.resting) {
        // Bubbles that reach the top rest there, drift toward the cup wall, then burst.
        resting++;
        bubble.x = Math.max(LEFT + 10 + bubble.r, Math.min(RIGHT - 10 - bubble.r, bubble.x + bubble.drift * dt));
        bubble.y = top - bubble.r * 0.35;
        bubble.life -= dt;
        if (bubble.life <= 0) pop(bubble, top);
        continue;
      }
      // Rising air expands as the pressure drops; bigger bubbles rise faster and zig-zag more.
      bubble.r = bubble.r0 * (1 + 0.3 * clamp01((BOTTOM - bubble.y) / 420));
      bubble.vy += (-(70 + 40 * bubble.r) - bubble.vy) * Math.min(1, dt * 3);
      bubble.x = Math.max(LEFT + 14, Math.min(RIGHT - 14, bubble.x + Math.cos(bubble.age * (7 + bubble.r0) + bubble.wobble) * bubble.r * 9 * dt));
      bubble.y += bubble.vy * dt;
      if (bubble.y - bubble.r * 0.5 <= top) {
        if (bubble.r > 1.8 && Math.random() < 0.75) {
          bubble.resting = true;
          bubble.life = rand(0.25, 0.5) + bubble.r * 0.09;
          bubble.drift = (bubble.x < (LEFT + RIGHT) / 2 ? -1 : 1) * rand(15, 55);
        } else pop(bubble, top);
      }
    }
    if (resting > MAX_RESTING) {
      bubbles
        .filter((bubble) => bubble.resting && bubble.life > 0)
        .sort((a, b) => a.life - b.life)
        .slice(0, resting - MAX_RESTING)
        .forEach((bubble) => pop(bubble, bubble.y));
    }
    for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].life < 0) bubbles.splice(i, 1);
    for (const ring of rings) ring.age += dt;
    for (let i = rings.length - 1; i >= 0; i--) if (rings[i].age > 0.32) rings.splice(i, 1);
  }

  function draw(mask: HTMLCanvasElement, target: HTMLImageElement) {
    context!.clearRect(0, 0, SIZE, SIZE);
    if (fill > 0.002) {
      const top = levelY(fill);
      const points: [number, number][] = [];
      for (let x = LEFT - 6; x <= RIGHT + 6; x += 6) points.push([x, surface(x)]);
      liquid!.globalCompositeOperation = "source-over";
      liquid!.clearRect(0, 0, SIZE, SIZE);
      liquid!.beginPath();
      liquid!.moveTo(LEFT - 6, SIZE);
      for (const [x, y] of points) liquid!.lineTo(x, y);
      liquid!.lineTo(RIGHT + 6, SIZE);
      liquid!.closePath();
      const depth = liquid!.createLinearGradient(0, top, 0, BOTTOM);
      depth.addColorStop(0, "rgb(162,124,97)");
      depth.addColorStop(0.25, "rgb(150,114,89)");
      depth.addColorStop(1, "rgb(126,93,71)");
      liquid!.fillStyle = depth;
      liquid!.fill();
      // Light catches the top of the coffee, and it climbs a little where it meets the cup wall.
      const sheen = liquid!.createLinearGradient(0, top - 6, 0, top + 46);
      sheen.addColorStop(0, "rgba(232,200,165,.38)");
      sheen.addColorStop(1, "rgba(232,200,165,0)");
      liquid!.globalCompositeOperation = "source-atop";
      liquid!.fillStyle = sheen;
      liquid!.fillRect(LEFT - 6, top - 20, RIGHT - LEFT + 12, 70);
      liquid!.globalCompositeOperation = "source-over";
      for (const [x, dir] of [[LEFT + 3, 1], [RIGHT - 3, -1]] as const) {
        const y = surface(x);
        const meniscus = liquid!.createLinearGradient(x, 0, x + dir * 22, 0);
        meniscus.addColorStop(0, "rgba(228,194,156,.75)");
        meniscus.addColorStop(1, "rgba(228,194,156,0)");
        liquid!.beginPath();
        liquid!.moveTo(x, y - 7);
        liquid!.quadraticCurveTo(x + dir * 6, y, x + dir * 22, y + 2);
        liquid!.lineTo(x + dir * 22, y + 10);
        liquid!.lineTo(x, y + 10);
        liquid!.closePath();
        liquid!.fillStyle = meniscus;
        liquid!.fill();
      }
      liquid!.beginPath();
      points.forEach(([x, y], i) => (i ? liquid!.lineTo(x, y + 2) : liquid!.moveTo(x, y + 2)));
      liquid!.lineWidth = 3;
      liquid!.strokeStyle = "rgba(236,204,168,.5)";
      liquid!.stroke();
      for (const bubble of bubbles) if (!bubble.resting) drawBubble(liquid!, bubble);
      for (const bubble of bubbles) if (bubble.resting) drawBubble(liquid!, bubble);
      liquid!.globalCompositeOperation = "destination-in";
      liquid!.drawImage(mask, 0, 0);
      context!.drawImage(layer, 0, 0);
    }
    for (const ring of rings) {
      const k = ring.age / 0.32;
      context!.beginPath();
      context!.ellipse(ring.x, ring.y, ring.r * (1 + k * 1.6), ring.r * (0.4 + k * 0.5), 0, 0, Math.PI * 2);
      context!.lineWidth = 2;
      context!.strokeStyle = `rgba(255,240,225,${0.8 * (1 - k)})`;
      context!.stroke();
    }
    const handoff = clamp01((elapsed - REFILL_MS - SETTLE_MS) / HANDOFF_MS);
    if (handoff > 0) {
      context!.globalAlpha = handoff;
      context!.imageSmoothingEnabled = false;
      context!.drawImage(target, 0, 0, SIZE, SIZE);
      context!.globalAlpha = 1;
    }
  }

  Promise.all([liquidMask(fullSrc, emptySrc), loadImage(toSrc)])
    .then(([mask, target]) => {
      let last = performance.now();
      const tick = (now: number) => {
        if (cancelled) return;
        update(Math.min(0.05, (now - last) / 1000));
        last = now;
        draw(mask, target);
        if (elapsed >= REFILL_MS + SETTLE_MS + HANDOFF_MS) return onDone();
        frameId = requestAnimationFrame(tick);
      };
      frameId = requestAnimationFrame(tick);
    })
    .catch((error: unknown) => {
      console.error("Failed to play the coffee refill:", error);
      if (!cancelled) onDone();
    });

  return () => {
    cancelled = true;
    cancelAnimationFrame(frameId);
  };
}

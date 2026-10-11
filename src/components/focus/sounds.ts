/*
 * Sound themes, all synthesized with Web Audio (no audio files).
 * Every theme covers the same moments so switching themes never leaves a moment unexpectedly silent,
 * except where a theme deliberately stays quiet (null).
 */

export type SoundEvent = "tap" | "focusStart" | "focusEnd" | "breakStart" | "breakEnd" | "pause" | "resume";

interface Overtone {
  /** Frequency multiple of the note. */
  readonly ratio: number;
  /** Volume relative to the note. */
  readonly volume: number;
  /** Duration relative to the note. */
  readonly length: number;
}

interface Note {
  readonly frequency: number;
  /** Seconds after the sound starts. */
  readonly delay: number;
  /** Seconds until the note has faded out. */
  readonly duration: number;
  /** Peak gain; kept at or below 0.15 so no theme startles. */
  readonly volume: number;
  readonly wave?: OscillatorType;
  readonly attack?: number;
  readonly overtones?: readonly Overtone[];
}

export type SoundThemeId = "classic" | "glass" | "wood" | "bowl" | "soft" | "silent";

export interface SoundTheme {
  readonly id: SoundThemeId;
  readonly name: string;
  readonly description: string;
  readonly sounds: Readonly<Record<SoundEvent, readonly Note[] | null>>;
}

// A quiet inharmonic overtone is what makes a plain sine read as a bell.
const BELL: readonly Overtone[] = [{ ratio: 2.76, volume: 0.25, length: 0.5 }];
const GLASS: readonly Overtone[] = [
  { ratio: 2, volume: 0.35, length: 0.6 },
  { ratio: 3.01, volume: 0.12, length: 0.35 },
];
// Marimba bars ring at roughly 1 : 3.9, which gives the woody "tock".
const MALLET: readonly Overtone[] = [{ ratio: 3.93, volume: 0.2, length: 0.3 }];
const BOWL: readonly Overtone[] = [
  { ratio: 2.76, volume: 0.35, length: 0.6 },
  { ratio: 5.4, volume: 0.12, length: 0.3 },
];

const note = (frequency: number, delay: number, duration: number, volume: number, extra: Partial<Note> = {}): Note => ({
  frequency,
  delay,
  duration,
  volume,
  ...extra,
});
const ping = (frequency: number, delay: number, duration = 1, volume = 0.09) => note(frequency, delay, duration, volume, { overtones: GLASS });
const mallet = (frequency: number, delay: number, duration = 0.45, volume = 0.13) =>
  note(frequency, delay, duration, volume, { wave: "triangle", overtones: MALLET });
const strike = (frequency: number, delay: number, duration = 3.5, volume = 0.12) =>
  note(frequency, delay, duration, volume, { attack: 0.02, overtones: BOWL });
const blip = (frequency: number, delay: number, duration = 0.2, volume = 0.05) => note(frequency, delay, duration, volume);

const CLASSIC_CHIME = [note(659.25, 0, 0.35, 0.12), note(880, 0.12, 0.5, 0.12)];
const CLASSIC_BELL = [
  note(783.99, 0, 1.2, 0.14, { overtones: BELL }),
  note(659.25, 0.28, 1.2, 0.14, { overtones: BELL }),
  note(523.25, 0.56, 1.6, 0.14, { overtones: BELL }),
];

export const SOUND_THEMES: readonly SoundTheme[] = [
  {
    id: "classic",
    name: "Classic",
    description: "Bright two-note chime to start, warm bell to finish. The original sounds.",
    sounds: {
      tap: null,
      focusStart: CLASSIC_CHIME,
      focusEnd: CLASSIC_BELL,
      breakStart: CLASSIC_CHIME,
      breakEnd: CLASSIC_BELL,
      pause: null,
      resume: CLASSIC_CHIME,
    },
  },
  {
    id: "glass",
    name: "Glass",
    description: "Crystal pings with a soft tick on every button. Light and precise.",
    sounds: {
      tap: [note(3200, 0, 0.03, 0.025)],
      focusStart: [ping(1318.51, 0, 0.9)],
      focusEnd: [ping(1760, 0, 1.4), ping(1318.51, 0.22, 1.4), ping(880, 0.44, 2)],
      breakStart: [ping(1318.51, 0, 0.9), ping(987.77, 0.16, 1.2)],
      breakEnd: [ping(987.77, 0, 0.9), ping(1318.51, 0.16, 1), ping(1760, 0.32, 1.4)],
      pause: [ping(987.77, 0, 0.35, 0.05)],
      resume: [ping(1318.51, 0, 0.35, 0.05)],
    },
  },
  {
    id: "wood",
    name: "Wood",
    description: "Warm marimba phrases and a woodblock tap. Friendly and musical.",
    sounds: {
      tap: [note(1100, 0, 0.05, 0.05, { wave: "triangle" })],
      focusStart: [mallet(523.25, 0), mallet(659.25, 0.09), mallet(783.99, 0.18)],
      focusEnd: [mallet(783.99, 0), mallet(659.25, 0.12), mallet(523.25, 0.24), mallet(392, 0.4), mallet(523.25, 0.62, 0.9)],
      breakStart: [mallet(659.25, 0), mallet(523.25, 0.12, 0.6)],
      breakEnd: [mallet(523.25, 0), mallet(659.25, 0.08), mallet(783.99, 0.16), mallet(1046.5, 0.24, 0.7)],
      pause: [mallet(392, 0, 0.3, 0.07)],
      resume: [mallet(523.25, 0, 0.3, 0.07)],
    },
  },
  {
    id: "bowl",
    name: "Singing bowl",
    description: "Deep, slowly fading bowl strikes. Calm; quiet for pause and taps.",
    sounds: {
      tap: null,
      focusStart: [strike(261.63, 0, 3)],
      focusEnd: [strike(196, 0, 4), strike(196, 1.4, 4.5)],
      breakStart: [strike(174.61, 0)],
      breakEnd: [strike(220, 0, 2.5), strike(293.66, 0.9)],
      pause: null,
      resume: null,
    },
  },
  {
    id: "soft",
    name: "Soft",
    description: "Short, low-volume blips for libraries and shared offices.",
    sounds: {
      tap: null,
      focusStart: [blip(880, 0)],
      focusEnd: [blip(880, 0, 0.25), blip(659.25, 0.22, 0.25), blip(880, 0.44, 0.3)],
      breakStart: [blip(659.25, 0), blip(523.25, 0.18)],
      breakEnd: [blip(523.25, 0), blip(659.25, 0.18), blip(880, 0.36)],
      pause: [blip(523.25, 0, 0.1, 0.03)],
      resume: [blip(659.25, 0, 0.1, 0.03)],
    },
  },
  {
    id: "silent",
    name: "Silent",
    description: "No sounds at all. Notifications still appear when they're on.",
    sounds: { tap: null, focusStart: null, focusEnd: null, breakStart: null, breakEnd: null, pause: null, resume: null },
  },
];

export const DEFAULT_SOUND_THEME: SoundThemeId = "classic";
const THEME_KEY = "bft:soundTheme";

const themeById = (id: SoundThemeId): SoundTheme => SOUND_THEMES.find((theme) => theme.id === id) ?? SOUND_THEMES[0];

export function getSoundThemeId(): SoundThemeId {
  const stored = typeof window === "undefined" ? null : localStorage.getItem(THEME_KEY);
  return SOUND_THEMES.some((theme) => theme.id === stored) ? (stored as SoundThemeId) : DEFAULT_SOUND_THEME;
}

export function setSoundThemeId(id: SoundThemeId): void {
  localStorage.setItem(THEME_KEY, id);
}

const ATTACK_SECONDS = 0.01;
const SILENCE = 0.0001;

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") context.resume().catch((error: unknown) => console.error("Failed to resume audio:", error));
    return context;
  } catch (error) {
    console.error("Audio unavailable:", error);
    return null;
  }
}

function playTone(audio: AudioContext, tone: Note): void {
  const startAt = audio.currentTime + tone.delay;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = tone.wave ?? "sine";
  oscillator.frequency.value = tone.frequency;
  gain.gain.setValueAtTime(SILENCE, startAt);
  gain.gain.exponentialRampToValueAtTime(tone.volume, startAt + (tone.attack ?? ATTACK_SECONDS));
  gain.gain.exponentialRampToValueAtTime(SILENCE, startAt + tone.duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + tone.duration);
}

const withOvertones = (tone: Note): Note[] => [
  tone,
  ...(tone.overtones ?? []).map((overtone) => ({
    ...tone,
    frequency: tone.frequency * overtone.ratio,
    volume: tone.volume * overtone.volume,
    duration: tone.duration * overtone.length,
    overtones: undefined,
  })),
];

function playNotes(notes: readonly Note[] | null, label: string): void {
  if (!notes) return;
  const audio = audioContext();
  if (!audio) return;
  try {
    notes.flatMap(withOvertones).forEach((tone) => playTone(audio, tone));
  } catch (error) {
    console.error(`Failed to play ${label} sound:`, error);
  }
}

/** Plays `event` in the user's chosen theme. */
export function playSound(event: SoundEvent): void {
  playNotes(themeById(getSoundThemeId()).sounds[event], event);
}

/** Plays `event` in any theme, for previews in the sound picker. */
export function previewSound(themeId: SoundThemeId, event: SoundEvent): void {
  playNotes(themeById(themeId).sounds[event], `${themeId} ${event}`);
}

/** Marks a button that plays its own sound, so it doesn't also tick. */
export const OWN_SOUND_ATTRIBUTE = "data-own-sound";

if (typeof window !== "undefined") {
  // Browsers only let audio start after a user gesture, and the end sound fires from a timer.
  window.addEventListener("pointerdown", audioContext, { once: true });
  window.addEventListener("keydown", audioContext, { once: true });
  window.addEventListener(
    "click",
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest("button, [role='button'], a[href]");
      if (button && !button.closest(`[${OWN_SOUND_ATTRIBUTE}]`)) playSound("tap");
    },
    true,
  );
}

export type SoundName = "start" | "end";

interface Note {
  readonly frequency: number;
  readonly delay: number;
  readonly duration: number;
  readonly volume: number;
}

const START_CHIME: readonly Note[] = [
  { frequency: 659.25, delay: 0, duration: 0.35, volume: 0.12 },
  { frequency: 880, delay: 0.12, duration: 0.5, volume: 0.12 },
];

const END_BELL: readonly Note[] = [
  { frequency: 783.99, delay: 0, duration: 1.2, volume: 0.14 },
  { frequency: 659.25, delay: 0.28, duration: 1.2, volume: 0.14 },
  { frequency: 523.25, delay: 0.56, duration: 1.6, volume: 0.14 },
];

// A quiet inharmonic partial is what makes a plain sine read as a bell.
const BELL_PARTIAL = 2.76;
const BELL_PARTIAL_VOLUME = 0.25;
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

// Browsers only let audio start after a user gesture, and the end sound fires from a timer.
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", audioContext, { once: true });
  window.addEventListener("keydown", audioContext, { once: true });
}

function playTone(audio: AudioContext, note: Note): void {
  const startAt = audio.currentTime + note.delay;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = note.frequency;
  gain.gain.setValueAtTime(SILENCE, startAt);
  gain.gain.exponentialRampToValueAtTime(note.volume, startAt + ATTACK_SECONDS);
  gain.gain.exponentialRampToValueAtTime(SILENCE, startAt + note.duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + note.duration);
}

const withPartial = (note: Note): Note[] => [
  note,
  { ...note, frequency: note.frequency * BELL_PARTIAL, duration: note.duration / 2, volume: note.volume * BELL_PARTIAL_VOLUME },
];

export function playSound(name: SoundName): void {
  const audio = audioContext();
  if (!audio) return;
  const notes = name === "start" ? START_CHIME : END_BELL.flatMap(withPartial);
  try {
    notes.forEach((note) => playTone(audio, note));
  } catch (error) {
    console.error(`Failed to play ${name} sound:`, error);
  }
}

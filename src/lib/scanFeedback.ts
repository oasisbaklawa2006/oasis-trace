// Scan feedback — short WebAudio beeps + optional vibration. Distinct sound
// patterns per outcome. Volume + global mute are operator-configurable from
// Settings (`ols_scan_volume`, `ols_scan_muted`). Backwards compatible:
// `ols_scan_feedback === "off"` still mutes everything.
const FEEDBACK_KEY = "ols_scan_feedback";
const VOLUME_KEY = "ols_scan_volume";
const MUTED_KEY = "ols_scan_muted";

type WindowWithWebkitAudio = typeof window & {
  webkitAudioContext?: typeof AudioContext;
};

let ctx: AudioContext | null = null;
function audio() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const w = window as WindowWithWebkitAudio;
    try {
      const Ctor = w.AudioContext || w.webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    catch { return null; }
  }
  return ctx;
}

/** Outcome categories — each gets a distinct sound + vibration signature. */
export type Beep = "ok" | "dup" | "blocked" | "approval" | "error";

export function isFeedbackEnabled(): boolean {
  if (typeof localStorage === "undefined") return false;
  if (localStorage.getItem(FEEDBACK_KEY) === "off") return false;
  if (localStorage.getItem(MUTED_KEY) === "1") return false;
  return true;
}
export function setFeedbackEnabled(on: boolean) {
  try { localStorage.setItem(FEEDBACK_KEY, on ? "on" : "off"); } catch { /* ignore */ }
}
export function isMuted(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(MUTED_KEY) === "1";
}
export function setMuted(m: boolean) {
  try { localStorage.setItem(MUTED_KEY, m ? "1" : "0"); } catch { /* ignore */ }
}
/** Volume 0..1 (default 0.6). */
export function getVolume(): number {
  if (typeof localStorage === "undefined") return 0.6;
  const v = parseFloat(localStorage.getItem(VOLUME_KEY) || "");
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.6;
}
export function setVolume(v: number) {
  try { localStorage.setItem(VOLUME_KEY, String(Math.max(0, Math.min(1, v)))); } catch { /* ignore */ }
}

/** A short tone-sequence describes each pattern. */
type Tone = { freq: number; dur: number; type?: OscillatorType; gap?: number };
const PATTERNS: Record<Beep, Tone[]> = {
  // OK: single bright high blip
  ok:       [{ freq: 1320, dur: 0.07, type: "sine" }],
  // Duplicate: two quick mid-tones
  dup:      [{ freq: 660, dur: 0.07, type: "triangle", gap: 0.05 }, { freq: 660, dur: 0.07, type: "triangle" }],
  // Blocked dispatch: low square triple — clearly negative
  blocked:  [{ freq: 180, dur: 0.12, type: "square", gap: 0.05 }, { freq: 180, dur: 0.12, type: "square", gap: 0.05 }, { freq: 140, dur: 0.18, type: "square" }],
  // Approval required: rising 2-tone chime
  approval: [{ freq: 660, dur: 0.10, type: "sine", gap: 0.04 }, { freq: 990, dur: 0.14, type: "sine" }],
  // Generic error: long low buzz
  error:    [{ freq: 220, dur: 0.30, type: "sawtooth" }],
};

const VIBE: Record<Beep, number | number[]> = {
  ok: 30,
  dup: [25, 50, 25],
  blocked: [80, 40, 80, 40, 120],
  approval: [40, 60, 80],
  error: [120, 60, 120],
};

export function playBeep(kind: Beep) {
  if (!isFeedbackEnabled()) return;
  const a = audio(); if (!a) return;
  const vol = getVolume();
  if (vol <= 0) return;
  let t = a.currentTime;
  for (const tone of PATTERNS[kind]) {
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = tone.type || "sine";
    osc.frequency.value = tone.freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.25 * vol), t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + tone.dur);
    osc.connect(gain); gain.connect(a.destination);
    osc.start(t); osc.stop(t + tone.dur + 0.02);
    t += tone.dur + (tone.gap || 0);
  }
}

export function vibrate(kind: Beep) {
  if (!isFeedbackEnabled()) return;
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  try { navigator.vibrate(VIBE[kind]); } catch { /* ignore */ }
}

export function feedback(kind: Beep) {
  playBeep(kind);
  vibrate(kind);
}

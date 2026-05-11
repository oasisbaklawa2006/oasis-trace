// Scan feedback — short WebAudio beeps + optional vibration. Opt-in via the
// `ols_scan_feedback` localStorage flag (Settings page). Quiet by default
// outside warehouses.
const KEY = "ols_scan_feedback";

let ctx: AudioContext | null = null;
function audio() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try { ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); }
    catch { return null; }
  }
  return ctx;
}

export type Beep = "ok" | "error" | "dup";

export function isFeedbackEnabled(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(KEY) !== "off";
}
export function setFeedbackEnabled(on: boolean) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* ignore */ }
}

export function playBeep(kind: Beep) {
  if (!isFeedbackEnabled()) return;
  const a = audio(); if (!a) return;
  const profiles = {
    ok:    { freq: 880, duration: 0.08, type: "sine" as OscillatorType },
    error: { freq: 220, duration: 0.30, type: "square" as OscillatorType },
    dup:   { freq: 440, duration: 0.18, type: "triangle" as OscillatorType },
  };
  const p = profiles[kind];
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = p.type; osc.frequency.value = p.freq;
  gain.gain.setValueAtTime(0.0001, a.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, a.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + p.duration);
  osc.connect(gain); gain.connect(a.destination);
  osc.start(); osc.stop(a.currentTime + p.duration + 0.02);
}

export function vibrate(pattern: number | number[]) {
  if (!isFeedbackEnabled()) return;
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  try { navigator.vibrate(pattern); } catch { /* ignore */ }
}

export function feedback(kind: Beep) {
  playBeep(kind);
  vibrate(kind === "ok" ? 40 : kind === "dup" ? [30, 60, 30] : [80, 60, 80]);
}

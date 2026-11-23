export const BONDHU_STATES = Object.freeze(["idle", "happy", "listening", "talking", "sleeping", "flying", "dragging"]);

export function normalizeBondhuState(state) {
  if (state === "greeting" || state === "celebrating") return "happy";
  if (state === "thinking" || state === "concerned") return "listening";
  return BONDHU_STATES.includes(state) ? state : "idle";
}

/** Deterministic, low-amplitude character motion. Time is measured in seconds. */
export function getBondhuPose(state, time, reducedMotion = false) {
  const normalized = normalizeBondhuState(state);
  const t = Number.isFinite(time) ? time : 0;
  if (reducedMotion) {
    return {
      state: normalized,
      bob: 0,
      headTilt: normalized === "sleeping" ? 0.16 : normalized === "listening" ? -0.12 : 0,
      bodySway: 0,
      tailSway: 0,
      wingFlap: 0,
      armWave: 0,
      mouthOpen: 0,
      eyeOpen: normalized === "sleeping" ? 0.05 : 1,
    };
  }

  const sin = Math.sin;
  switch (normalized) {
    case "happy":
      return { state: normalized, bob: Math.abs(sin(t * 4.8)) * 0.12, headTilt: sin(t * 3.1) * 0.08, bodySway: sin(t * 4.8) * 0.025, tailSway: sin(t * 3.6) * 0.2, wingFlap: sin(t * 13) * 0.38, armWave: sin(t * 7) * 0.28, mouthOpen: 0, eyeOpen: 1 };
    case "listening":
      return { state: normalized, bob: sin(t * 1.5) * 0.018, headTilt: -0.17 + sin(t * 1.3) * 0.025, bodySway: sin(t * 1.5) * 0.012, tailSway: sin(t * 1.1) * 0.04, wingFlap: 0, armWave: 0, mouthOpen: 0, eyeOpen: 1 };
    case "talking":
      return { state: normalized, bob: sin(t * 6) * 0.018, headTilt: sin(t * 2.6) * 0.045, bodySway: sin(t * 3.3) * 0.018, tailSway: sin(t * 2.1) * 0.07, wingFlap: 0, armWave: sin(t * 4.2) * 0.08, mouthOpen: 0.08 + Math.abs(sin(t * 8.2)) * 0.24, eyeOpen: 1 };
    case "sleeping":
      return { state: normalized, bob: sin(t * 1.2) * 0.012, headTilt: 0.16, bodySway: sin(t * 1.2) * 0.012, tailSway: sin(t * 0.7) * 0.025, wingFlap: 0, armWave: 0, mouthOpen: 0, eyeOpen: 0.05 };
    case "flying":
      return { state: normalized, bob: sin(t * 2.2) * 0.055, headTilt: -0.07 + sin(t * 1.8) * 0.03, bodySway: sin(t * 2.4) * 0.026, tailSway: sin(t * 2.8) * 0.15, wingFlap: sin(t * 8) * 0.48, armWave: sin(t * 4) * 0.055, mouthOpen: 0, eyeOpen: 1 };
    case "dragging":
      return { state: normalized, bob: 0, headTilt: -0.1, bodySway: 0, tailSway: 0.08, wingFlap: 0.08, armWave: 0, mouthOpen: 0, eyeOpen: 1 };
    default:
      return { state: normalized, bob: sin(t * 1.5) * 0.035, headTilt: sin(t * 0.85) * 0.035, bodySway: sin(t * 1.5) * 0.015, tailSway: sin(t * 1.15) * 0.08, wingFlap: sin(t * 1.4) * 0.025, armWave: 0, mouthOpen: 0, eyeOpen: 1 };
  }
}

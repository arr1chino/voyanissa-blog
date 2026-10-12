// Bound full-screen pixel work separately from camera framing and CSS dimensions.
export function createHeroQuality({ devicePixelRatio = 1, compact = false } = {}) {
  const maxRatio = compact ? 1.25 : 1.5;
  const pixelBudget = compact ? 900000 : 2600000;
  let width = 1, height = 1, scale = 1, ratio = 1;
  let samples = 0, slow = 0, total = 0, reductions = 0;

  function resize(w, h) {
    width = Math.max(1, w); height = Math.max(1, h);
    const base = Math.min(devicePixelRatio, maxRatio, Math.sqrt(pixelBudget / (width * height)));
    ratio = Math.max(Math.min(devicePixelRatio, .75), base * scale);
    return ratio;
  }

  function sample(intervalMs, moving) {
    // Ignore idle 30fps, startup stalls, hidden-tab gaps and interrupted interactions.
    if (!moving || intervalMs > 100 || intervalMs < 8) {
      samples = slow = total = 0;
      return false;
    }
    samples++; total += intervalMs;
    if (intervalMs > 25) slow++;
    if (samples < 90) return false;
    const overloaded = total / samples > 23 && slow / samples > .35;
    samples = slow = total = 0;
    if (!overloaded || reductions >= 2 || ratio <= .8) return false;
    reductions++; scale *= .85;
    const previous = ratio;
    resize(width, height);
    return previous !== ratio;
  }

  return {
    resize, sample,
    get pixelRatio() { return ratio; },
    get compact() { return compact; },
    get motionBlurMax() { return compact ? 1.6 : 3.2; },
    snapshot() { return { profile: compact ? 'compact' : 'balanced', pixelRatio: ratio, reductions, activeFpsCap: 60, idleFpsCap: 30 }; }
  };
}
